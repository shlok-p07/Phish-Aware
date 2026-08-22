import { describe, expect, it, beforeEach } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { installMongoMock, fakeDbState, resetFakeDbState } from "@/test/mock-mongo";
import { installOpenidClientMock, openidClientMockState, resetOpenidClientMockState } from "@/test/mock-openid-client";
import { installSsoOidcMock, ssoOidcMockState, resetSsoOidcMockState } from "@/test/mock-sso-oidc";

await installMongoMock();
await installOpenidClientMock();
await installSsoOidcMock();

/*
 * siteUrl() reads APP_BASE_URL / NEXT_PUBLIC_SITE_URL, and these tests assert on
 * the exact redirect it builds. Pinned here rather than inherited from whatever
 * .env happens to hold: the repo's own .env points at the deployed origin, so
 * these two cases passed in CI, where there is no .env, and failed for anybody
 * running them locally. A test that asserts a URL has to own the URL.
 */
const env = process.env as Record<string, string | undefined>;
env.APP_BASE_URL = "http://localhost:3000";
env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

const { GET } = await import("./route");
const { SSO_STATE_COOKIE } = await import("@/server/sso/cookies");
const { SESSION_COOKIE } = await import("@/server/session");

const ORG_ID = new ObjectId();
const CONNECTION_ID = new ObjectId();
const STATE = "abc123state";

function seedConnection(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: CONNECTION_ID,
    ssoConnectionId: CONNECTION_ID,
    orgId: ORG_ID,
    providerKind: "generic",
    issuer: "https://idp.test/",
    clientId: "client-id",
    clientSecretEnc: "enc",
    extraScopes: [],
    allowedDomains: [],
    requireVerifiedEmail: false,
    enabled: true,
    discovery: null,
    discoveryFetchedAt: null,
    lastTestAt: null,
    lastTestOk: null,
    lastTestError: null,
    configVersion: 1,
    ...overrides,
  };
  fakeDbState.ssoConnections.push(doc);
  return doc;
}

function seedState(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new ObjectId(),
    state: STATE,
    nonce: "nonce123",
    codeVerifier: "verifier123",
    orgId: ORG_ID,
    connectionId: CONNECTION_ID,
    redirectTo: "/dashboard",
    emailHint: null,
    isTest: false,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  };
  fakeDbState.ssoStates.push(doc);
  return doc;
}

function seedActiveMember(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new ObjectId(),
    orgId: ORG_ID,
    email: "member@acme.test",
    status: "active",
    role: "employee",
    department: null,
    onboardingCompleted: true,
    ...overrides,
  };
  fakeDbState.users.push(doc);
  return doc;
}

function seedInvitation(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new ObjectId(),
    orgId: ORG_ID,
    email: "newperson@acme.test",
    role: "employee",
    department: null,
    status: "pending",
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    acceptedAt: null,
    acceptedUserId: null,
    ...overrides,
  };
  fakeDbState.invitations.push(doc);
  return doc;
}

/** Fakes a successful token exchange returning the given ID token claims. */
function mockSuccessfulExchange(claims: Record<string, unknown>, accessToken = "at-123") {
  openidClientMockState.authorizationCodeGrant = async () => ({
    access_token: accessToken,
    claims: () => claims,
  });
}

function getCallback(query: Record<string, string> = { state: STATE, code: "auth-code" }, cookieState: string | null = STATE) {
  const url = new URL("http://localhost:3000/api/auth/sso/callback");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const req = new NextRequest(url);
  // Bun's Headers implementation silently drops a "Cookie" header set via the
  // Request/NextRequest constructor -- it's a forbidden header name per the
  // Fetch spec. RequestCookies has its own set() though, so this reaches the
  // exact same jar the route reads via req.cookies.get(...).
  if (cookieState !== null) req.cookies.set(SSO_STATE_COOKIE, cookieState);
  return GET(req);
}

function ssoErrorCode(res: Response): string | null {
  const location = res.headers.get("location");
  if (!location) return null;
  return new URL(location).searchParams.get("sso_error");
}

beforeEach(() => {
  resetFakeDbState();
  resetOpenidClientMockState();
  resetSsoOidcMockState();
});

describe("GET /api/auth/sso/callback", () => {
  it("fails with idp_error when the IdP itself reports an error", async () => {
    const res = await getCallback({ state: STATE, error: "access_denied" });
    expect(res.status).toBe(302);
    expect(ssoErrorCode(res)).toBe("idp_error");
  });

  it("fails with invalid_state when there's no state param at all", async () => {
    const res = await getCallback({});
    expect(ssoErrorCode(res)).toBe("invalid_state");
  });

  it("fails with invalid_state when the cookie doesn't match the query param", async () => {
    const res = await getCallback({ state: STATE, code: "x" }, "a-different-state");
    expect(ssoErrorCode(res)).toBe("invalid_state");
  });

  it("fails with invalid_state on a replayed callback (state already consumed)", async () => {
    // No seedState() -- nothing in the store to findOneAndDelete.
    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("invalid_state");
  });

  it("fails with state_expired when the row is still there but past its expiry", async () => {
    seedConnection();
    seedState({ expiresAt: new Date(Date.now() - 1) });
    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("state_expired");
  });

  it("consumes the state row even when it turns out to be expired (still single-use)", async () => {
    seedConnection();
    seedState({ expiresAt: new Date(Date.now() - 1) });
    await getCallback();
    expect(fakeDbState.ssoStates).toHaveLength(0);
  });

  it("fails with not_configured when the connection behind the state no longer exists", async () => {
    seedState();
    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("not_configured");
  });

  it("logs an existing active member in and redirects to the state's redirectTo", async () => {
    seedConnection();
    seedState({ redirectTo: "/practice" });
    seedActiveMember({ email: "member@acme.test", onboardingCompleted: true });
    mockSuccessfulExchange({ sub: "sub-1", email: "member@acme.test", email_verified: true });

    const res = await getCallback();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/practice");
    // The route's declared return type is Response; at runtime it's always
    // the NextResponse the route itself constructs, which is what carries cookies.
    expect((res as NextResponse).cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    expect(fakeDbState.sessions).toHaveLength(1);
  });

  it("sends a member who hasn't finished onboarding there instead of their normal destination", async () => {
    seedConnection();
    seedState({ redirectTo: "/practice" });
    seedActiveMember({ email: "member@acme.test", onboardingCompleted: false });
    mockSuccessfulExchange({ sub: "sub-1", email: "member@acme.test", email_verified: true });

    const res = await getCallback();
    expect(res.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("creates a brand-new account for an invited address with no existing rows", async () => {
    seedConnection();
    seedState();
    seedInvitation({ email: "newperson@acme.test", role: "manager" });
    mockSuccessfulExchange({ sub: "sub-2", email: "newperson@acme.test", email_verified: true });

    const res = await getCallback();
    expect(res.status).toBe(302);
    expect(fakeDbState.users).toHaveLength(1);
    expect(fakeDbState.users[0]!.role).toBe("manager");
    expect(fakeDbState.users[0]!.passwordHash).toBeNull();
    expect(fakeDbState.invitations[0]!.status).toBe("accepted");
  });

  it("adopts an existing orphan account (signed up before being invited) instead of duplicating it", async () => {
    seedConnection();
    seedState();
    const orphan = seedActiveMember({ orgId: null, email: "newperson@acme.test", onboardingCompleted: true });
    seedInvitation({ email: "newperson@acme.test" });
    mockSuccessfulExchange({ sub: "sub-3", email: "newperson@acme.test", email_verified: true });

    const res = await getCallback();
    expect(res.status).toBe(302);
    expect(fakeDbState.users).toHaveLength(1);
    expect(fakeDbState.users[0]!._id.equals!(orphan._id)).toBe(true);
    expect(fakeDbState.users[0]!.orgId?.toString()).toBe(ORG_ID.toString());
  });

  it("refuses an address with no membership and no invitation", async () => {
    seedConnection();
    seedState();
    mockSuccessfulExchange({ sub: "sub-4", email: "stranger@acme.test", email_verified: true });

    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("not_a_member");
    expect(fakeDbState.users).toHaveLength(0);
  });

  it("refuses a disabled member even though they still technically exist", async () => {
    seedConnection();
    seedState();
    seedActiveMember({ email: "member@acme.test", status: "disabled" });
    mockSuccessfulExchange({ sub: "sub-5", email: "member@acme.test", email_verified: true });

    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("account_disabled");
  });

  it("refuses a Google account outside the connection's hosted domain, before even checking membership", async () => {
    seedConnection({ providerKind: "google", allowedDomains: ["acme.test"] });
    seedState();
    seedActiveMember({ email: "member@acme.test" });
    mockSuccessfulExchange({
      sub: "sub-6",
      email: "member@acme.test",
      email_verified: true,
      hd: "not-acme.test",
    });

    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("domain_not_allowed");
  });

  it("accepts a Google account whose hosted domain is on the allowlist", async () => {
    seedConnection({ providerKind: "google", allowedDomains: ["acme.test"] });
    seedState();
    seedActiveMember({ email: "member@acme.test" });
    mockSuccessfulExchange({
      sub: "sub-7",
      email: "member@acme.test",
      email_verified: true,
      hd: "acme.test",
    });

    const res = await getCallback();
    expect(res.status).toBe(302);
    expect(ssoErrorCode(res)).toBeNull();
  });

  it("refuses a new signup once the org's seat limit is already full", async () => {
    seedConnection();
    seedState();
    // Fills the only seat with someone unrelated to this sign-in attempt.
    seedActiveMember({ email: "someone-else@acme.test" });
    const org = { _id: ORG_ID, orgId: ORG_ID, settings: { seatLimit: 1 } };
    fakeDbState.organizations.push(org as never);
    seedInvitation({ email: "newperson@acme.test" });
    mockSuccessfulExchange({ sub: "sub-8", email: "newperson@acme.test", email_verified: true });

    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("seat_limit_reached");
    expect(fakeDbState.users).toHaveLength(1); // only the seat-filler, no new account
  });

  it("falls back to the userinfo endpoint when the ID token itself carries no email", async () => {
    seedConnection();
    seedState();
    seedActiveMember({ email: "member@acme.test" });
    mockSuccessfulExchange({ sub: "sub-9", email_verified: true });
    // The route only bothers calling userinfo when the config actually
    // advertises the endpoint.
    ssoOidcMockState.configurationFor = async () => ({
      serverMetadata: () => ({ userinfo_endpoint: "https://idp.test/userinfo" }),
    });
    openidClientMockState.fetchUserInfo = async () => ({ email: "member@acme.test", email_verified: true });

    const res = await getCallback();
    expect(res.status).toBe(302);
    expect(ssoErrorCode(res)).toBeNull();
  });

  it("fails with no_email when neither the ID token nor userinfo has an address", async () => {
    seedConnection();
    seedState();
    mockSuccessfulExchange({ sub: "sub-10" });
    openidClientMockState.fetchUserInfo = async () => ({});

    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("no_email");
  });

  it("reports token exchange failures as idp_error rather than leaking the raw error", async () => {
    seedConnection();
    seedState();
    openidClientMockState.authorizationCodeGrant = async () => {
      throw new Error("upstream network blip");
    };

    const res = await getCallback();
    expect(ssoErrorCode(res)).toBe("idp_error");
  });
});
