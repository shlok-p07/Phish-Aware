import { installModuleMock } from "@/test/mock-module-registry";

/**
 * Fakes just the two openid-client functions the SSO callback route calls
 * directly (authorizationCodeGrant, fetchUserInfo) -- everything else from
 * the real module is passed through, since other code (src/server/sso/oidc.ts)
 * uses openid-client's real classes (e.g. `instanceof client.Configuration`).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- these mirror openid-client's own loosely-typed public surface.
type AnyFn = (...args: any[]) => any;

export const openidClientMockState = {
  authorizationCodeGrant: (async () => {
    throw new Error("openidClientMockState.authorizationCodeGrant not configured for this test");
  }) as AnyFn,
  fetchUserInfo: (async () => {
    throw new Error("openidClientMockState.fetchUserInfo not configured for this test");
  }) as AnyFn,
};

export function resetOpenidClientMockState() {
  openidClientMockState.authorizationCodeGrant = async () => {
    throw new Error("openidClientMockState.authorizationCodeGrant not configured for this test");
  };
  openidClientMockState.fetchUserInfo = async () => {
    throw new Error("openidClientMockState.fetchUserInfo not configured for this test");
  };
}

export async function installOpenidClientMock() {
  const real = await import("openid-client");
  installModuleMock("openid-client", "@/test/mock-openid-client", () => ({
    ...real,
    authorizationCodeGrant: (...args: unknown[]) => openidClientMockState.authorizationCodeGrant(...args),
    fetchUserInfo: (...args: unknown[]) => openidClientMockState.fetchUserInfo(...args),
  }));
}
