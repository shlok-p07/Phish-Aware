import { NextRequest, NextResponse } from "next/server";
import * as client from "openid-client";
import {
  ssoConnectionsCollection,
  ssoStatesCollection,
  usersCollection,
  invitationsCollection,
  organizationsCollection,
} from "@/db";
import { withErrorHandling } from "@/server/http";
import { normalizeEmail } from "@/server/sso/domain";
import { extractIdentity, displayName } from "@/server/sso/idToken";
import {
  decideSsoProvisioning,
  selectInvitation,
  type SsoRejectCode,
} from "@/server/sso/provisioning";
import { configurationFor } from "@/server/sso/oidc";
import { buildUserDoc } from "@/server/users";
import { createSessionRow, sessionCookieOptions, SESSION_COOKIE } from "@/server/session";
import { siteUrl } from "@/server/siteUrl";
import { SSO_STATE_COOKIE } from "@/server/sso/cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Every failure path here redirects to /auth?sso_error=<code>, never JSON --
 * this is a browser navigation, and a JSON error body is a dead end for the
 * user. The code is looked up client-side (src/lib/sso-errors.ts), so nothing
 * the IdP sent is ever echoed into the URL.
 */
function fail(code: string): NextResponse {
  const res = NextResponse.redirect(`${siteUrl()}/auth?sso_error=${code}`, 302);
  res.cookies.delete(SSO_STATE_COOKIE);
  return res;
}

function testResult(outcome: string): NextResponse {
  const res = NextResponse.redirect(`${siteUrl()}/admin/settings?sso_test=${outcome}`, 302);
  res.cookies.delete(SSO_STATE_COOKIE);
  return res;
}

/**
 * This is a browser navigation, so it must ALWAYS end in a redirect -- never a
 * JSON error body, which is a dead end for the user and leaks nothing useful.
 * withErrorHandling would happily turn an unhandled Mongo or claims error into
 * {"error":"Internal server error"} rendered as raw text in the address bar,
 * so the whole handler is contained here and the detail goes to the log.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  try {
    return await handleCallback(req);
  } catch (err) {
    console.error(
      "[sso] callback failed unexpectedly:",
      err instanceof Error ? `${err.name}: ${err.message}` : err,
      err instanceof Error && err.stack ? `\n${err.stack}` : "",
    );
    return fail("unexpected");
  }
});

async function handleCallback(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;

  const idpError = params.get("error");
  if (idpError) {
    // Log what the IdP actually said -- never surface it, since it's
    // attacker-influencable text, but an admin needs it to debug.
    console.error(
      `[sso] identity provider returned error=${idpError} description=${
        params.get("error_description") ?? "(none)"
      }`,
    );
    return fail("idp_error");
  }

  const state = params.get("state");
  const cookieState = req.cookies.get(SSO_STATE_COOKIE)?.value;
  // Without this, an attacker could complete a flow against their own IdP
  // account and hand the resulting ?code=&state= URL to a victim, silently
  // logging the victim into the attacker's session. Requiring the cookie to
  // match binds the callback to the browser that started the flow.
  if (!state || !cookieState || state !== cookieState) {
    return fail("invalid_state");
  }

  // Atomic single-use consume: a replayed callback URL finds nothing.
  const states = await ssoStatesCollection();
  const stateDoc = await states.findOneAndDelete({ state });
  if (!stateDoc) {
    return fail("invalid_state");
  }
  // Mongo's TTL monitor lags by up to a minute, so check in code as well.
  if (stateDoc.expiresAt.getTime() <= Date.now()) {
    return fail("state_expired");
  }

  const connections = await ssoConnectionsCollection();
  const connection = await connections.findOne({ _id: stateDoc.connectionId });
  if (!connection) {
    return fail("not_configured");
  }

  let config: client.Configuration;
  try {
    config = await configurationFor(connection);
  } catch {
    return fail("server_not_configured");
  }

  // Exchanges the code AND fully validates the ID token: signature against the
  // cached remote JWKS, iss exact-match, aud/azp, exp/iat/nbf with bounded
  // skew, at_hash/c_hash, and the nonce we generated in /start.
  let tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
  try {
    tokens = await client.authorizationCodeGrant(
      config,
      new URL(req.url.replace(req.nextUrl.origin, siteUrl())),
      {
        pkceCodeVerifier: stateDoc.codeVerifier,
        expectedNonce: stateDoc.nonce,
        expectedState: stateDoc.state,
        idTokenExpected: true,
      },
    );
  } catch (err) {
    // Never let this propagate raw: withErrorHandling's
    // isDatabaseUnavailableError substring-matches "connect"/"timed out", so a
    // network failure to the IdP would be reported as "Database unavailable".
    console.error("[sso] token exchange failed", err instanceof Error ? err.message : err);
    return stateDoc.isTest ? testResult("token_exchange_failed") : fail("idp_error");
  }

  const claims = tokens.claims();
  if (!claims) {
    return stateDoc.isTest ? testResult("no_claims") : fail("idp_error");
  }
  const identity = extractIdentity(claims);

  // Fall back to userinfo when the ID token carried no address (some Okta and
  // Entra configurations only release email there).
  let email = identity.email;
  if (!email && config.serverMetadata().userinfo_endpoint) {
    try {
      const info = await client.fetchUserInfo(config, tokens.access_token, claims.sub);
      email = extractIdentity(info as Record<string, unknown>).email;
    } catch {
      // Fall through to the no_email path below.
    }
  }
  if (!email) {
    return stateDoc.isTest ? testResult("no_email") : fail("no_email");
  }
  email = normalizeEmail(email);

  // Google's issuer is https://accounts.google.com for EVERY Google account on
  // earth, so allowedDomains plus the hosted-domain claim are the only things
  // scoping this connection to the org. Without hd, any gmail.com user whose
  // address happened to match would be indistinguishable from a Workspace one.
  if (connection.providerKind === "google") {
    const hd = identity.hostedDomain;
    if (!hd || !connection.allowedDomains.includes(hd)) {
      return stateDoc.isTest ? testResult("domain_not_allowed") : fail("domain_not_allowed");
    }
  }

  if (stateDoc.isTest) {
    await connections.updateOne(
      { _id: connection._id },
      { $set: { lastTestAt: new Date(), lastTestOk: true, lastTestError: null, updatedAt: new Date() } },
    );
    // Deliberately no session and no provisioning -- a config check only.
    return testResult("ok");
  }

  const [users, invitations, orgs] = await Promise.all([
    usersCollection(),
    invitationsCollection(),
    organizationsCollection(),
  ]);

  const [member, orphan, invitationRows, org, activeSeats] = await Promise.all([
    users.findOne({ orgId: connection.orgId, email }),
    users.findOne({ orgId: null, email }),
    // Every row, not one: an address can hold a live invitation alongside
    // spent ones from previous stints in the org. selectInvitation picks.
    // Revoked rows are included so a revocation is reported as such.
    invitations.find({ orgId: connection.orgId, email }).toArray(),
    orgs.findOne({ _id: connection.orgId }, { projection: { settings: 1 } }),
    users.countDocuments({ orgId: connection.orgId, status: { $ne: "disabled" } }),
  ]);

  const now = new Date();
  const invitation = selectInvitation(invitationRows, now);

  const decision = decideSsoProvisioning({
    email,
    emailVerified: identity.emailVerified,
    requireVerifiedEmail: connection.requireVerifiedEmail,
    allowedDomains: connection.allowedDomains,
    member: member ? { id: member._id.toString(), status: member.status } : null,
    orphan: orphan ? { id: orphan._id.toString() } : null,
    invitation: invitation
      ? {
          id: invitation._id.toString(),
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        }
      : null,
    activeSeats,
    seatLimit: org?.settings.seatLimit ?? 0,
    now,
  });

  if (decision.kind === "reject") {
    console.warn(
      `[sso] refused ${email}: ${decision.code} ` +
        `(member=${member ? member.status : "none"}, invitation=${
          invitation ? invitation.status : "none"
        }, emailVerified=${identity.emailVerified}, seats=${activeSeats}/${
          org?.settings.seatLimit ?? 0
        })`,
    );
    return fail(decision.code satisfies SsoRejectCode);
  }

  let userId: import("mongodb").ObjectId;
  let onboardingCompleted: boolean;

  if (decision.kind === "login") {
    await users.updateOne(
      { _id: member!._id },
      // Flip a legacy "invited" row to active while we're here.
      { $set: { status: "active", lastLoginAt: now, updatedAt: now } },
    );
    userId = member!._id;
    onboardingCompleted = member!.onboardingCompleted;
  } else if (decision.kind === "adopt") {
    // The org's IdP asserting this address, for a domain the admin bound to
    // this connection, is the proof of control that makes silent adoption safe
    // here -- unlike the password path, which refuses and demands a sign-in.
    // Keeps their XP, streak, badges, and attempt history.
    const adopted = await users.findOneAndUpdate(
      { _id: orphan!._id, orgId: null },
      {
        $set: {
          orgId: connection.orgId,
          role: decision.role,
          status: "active",
          lastLoginAt: now,
          updatedAt: now,
          // Only when the invitation pins one and they haven't already
          // answered the survey's department question themselves.
          ...(invitation?.department && !orphan!.department
            ? { department: invitation.department }
            : {}),
        },
      },
      { returnDocument: "after" },
    );
    if (!adopted) {
      return fail("not_a_member");
    }
    userId = adopted._id;
    onboardingCompleted = adopted.onboardingCompleted;
  } else {
    const created = buildUserDoc({
      name: displayName(identity.name, invitation?.name ?? null, email),
      email,
      // SSO accounts have no local password by design.
      passwordHash: null,
      orgId: connection.orgId,
      role: decision.role,
      // Pinned by the admin who sent the invitation, if there was one. Lets
      // the intro survey skip its department question.
      department: invitation?.department ?? null,
      status: "active",
      lastLoginAt: now,
      now,
    });
    await users.insertOne(created);
    userId = created._id;
    onboardingCompleted = false;
  }

  if (decision.kind !== "login" && invitation) {
    await invitations.updateOne(
      { _id: invitation._id, status: "pending" },
      { $set: { status: "accepted", acceptedAt: now, acceptedUserId: userId, updatedAt: now } },
    );
  }

  const { token, expiresAt } = await createSessionRow(userId);
  const destination = onboardingCompleted ? stateDoc.redirectTo : "/onboarding";
  const res = NextResponse.redirect(`${siteUrl()}${destination}`, 302);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  res.cookies.delete(SSO_STATE_COOKIE);
  console.log(`[sso] ${decision.kind} -> ${email} signed in to org ${connection.orgId.toString()}`);
  return res;
}
