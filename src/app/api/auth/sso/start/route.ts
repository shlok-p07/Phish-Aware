import { NextRequest, NextResponse } from "next/server";
import * as client from "openid-client";
import { ObjectId } from "mongodb";
import {
  ssoConnectionsCollection,
  ssoStatesCollection,
  usersCollection,
  toObjectId,
  SSO_STATE_TTL_MS,
  type SsoConnectionDoc,
} from "@/db";
import { withErrorHandling } from "@/server/http";
import { emailDomain, normalizeEmail } from "@/server/sso/domain";
import { safeRedirectPath } from "@/server/sso/redirect";
import {
  generateCodeVerifier,
  codeChallengeS256,
  generateState,
  generateNonce,
} from "@/server/sso/pkce";
import { configurationFor } from "@/server/sso/oidc";
import { isEncryptionConfigured } from "@/server/secretBox";
import { ssoRedirectUri, siteUrl } from "@/server/siteUrl";
import { getUserIdFromRequest, destroySession, purgeGuestUser } from "@/server/session";
import { rateLimit, clientIp } from "@/server/rateLimit";
import { SSO_STATE_COOKIE, ssoStateCookieOptions } from "@/server/sso/cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(code: string): NextResponse {
  return NextResponse.redirect(`${siteUrl()}/auth?sso_error=${code}`, 302);
}

/**
 * Kick off the authorization code flow: 302 the browser to the org's IdP.
 *
 * A GET returning a redirect, not a JSON endpoint -- which is exactly why it's
 * excluded from openapi.yaml. See the note at the top of that file.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const limit = rateLimit(`sso-start:${clientIp(req.headers)}`, 60, 60_000);
  if (!limit.ok) {
    return fail("rate_limited");
  }
  if (!isEncryptionConfigured()) {
    return fail("server_not_configured");
  }

  const params = req.nextUrl.searchParams;
  const email = params.get("email")?.trim() ?? "";
  const orgIdParam = params.get("orgId");
  const isTest = params.get("test") === "1";
  const redirectTo = safeRedirectPath(params.get("redirectTo"));

  const connections = await ssoConnectionsCollection();
  let connection: SsoConnectionDoc | null = null;

  if (orgIdParam) {
    // Admin "Test sign-in": resolve by org, and only for an admin of that org.
    const orgId = toObjectId(orgIdParam);
    const userId = await getUserIdFromRequest();
    if (!orgId || !userId) {
      return fail("not_configured");
    }
    const users = await usersCollection();
    const user = await users.findOne({ _id: userId });
    if (!user || user.role !== "admin" || !user.orgId?.equals(orgId)) {
      return fail("not_configured");
    }
    connection = await connections.findOne({ orgId });
  } else {
    const domain = emailDomain(email);
    if (!domain) {
      return fail("not_configured");
    }
    connection = await connections.findOne({ enabled: true, allowedDomains: domain });
  }

  if (!connection || (!connection.enabled && !isTest)) {
    return fail("not_configured");
  }

  let config: client.Configuration;
  try {
    config = await configurationFor(connection);
  } catch {
    return fail("server_not_configured");
  }

  const state = generateState();
  const nonce = generateNonce();
  const codeVerifier = generateCodeVerifier();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SSO_STATE_TTL_MS);
  const states = await ssoStatesCollection();
  await states.insertOne({
    _id: new ObjectId(),
    state,
    nonce,
    codeVerifier,
    orgId: connection.orgId,
    connectionId: connection._id,
    redirectTo,
    emailHint: email ? normalizeEmail(email) : null,
    isTest,
    createdAt: now,
    expiresAt,
  });

  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: ssoRedirectUri(),
    scope: ["openid", "email", "profile", ...connection.extraScopes].join(" "),
    state,
    nonce,
    code_challenge: codeChallengeS256(codeVerifier),
    code_challenge_method: "S256",
    ...(email ? { login_hint: normalizeEmail(email) } : {}),
  });

  // A guest session has no email to merge on (guests are anonymous by
  // construction), so it can't be carried into an org account. Purge it rather
  // than leaving an orphaned hour-long session behind. Guest data is
  // ephemeral anyway -- it has a 1-hour TTL.
  const currentUserId = await getUserIdFromRequest();
  if (currentUserId) {
    await destroySession();
    await purgeGuestUser(currentUserId);
  }

  const res = NextResponse.redirect(authUrl.href, 302);
  // Set on the response object rather than via cookies(), so the Set-Cookie
  // definitely rides along with the 302.
  res.cookies.set(SSO_STATE_COOKIE, state, ssoStateCookieOptions());
  return res;
});
