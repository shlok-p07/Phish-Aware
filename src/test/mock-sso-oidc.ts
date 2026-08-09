import { installModuleMock } from "@/test/mock-module-registry";

/**
 * Fakes configurationFor() from "@/server/sso/oidc" -- the real one does an
 * actual HTTPS discovery round trip to the IdP, which a unit test has no
 * business doing. Everything else from the real module (decideSsoProvisioning
 * lives elsewhere, but this file's own other exports like the JWKS cache
 * helpers) is passed through untouched.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stands in for client.Configuration, which the callback route only calls .serverMetadata() on directly.
type FakeConfig = any;

function defaultFakeConfig(): FakeConfig {
  return { serverMetadata: () => ({ userinfo_endpoint: undefined }) };
}

export const ssoOidcMockState = {
  configurationFor: async (): Promise<FakeConfig> => defaultFakeConfig(),
};

export function resetSsoOidcMockState() {
  ssoOidcMockState.configurationFor = async () => defaultFakeConfig();
}

export async function installSsoOidcMock() {
  const real = await import("@/server/sso/oidc");
  installModuleMock("@/server/sso/oidc", "@/test/mock-sso-oidc", () => ({
    ...real,
    configurationFor: () => ssoOidcMockState.configurationFor(),
  }));
}
