import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { siteUrl, ssoRedirectUri, inviteUrl } from "./siteUrl";

const ORIGINAL_BASE = process.env.APP_BASE_URL;
const ORIGINAL_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL;

function restore(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

beforeEach(() => {
  delete process.env.APP_BASE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterAll(() => {
  restore("APP_BASE_URL", ORIGINAL_BASE);
  restore("NEXT_PUBLIC_SITE_URL", ORIGINAL_PUBLIC);
});

describe("siteUrl", () => {
  it("defaults to localhost", () => {
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("uses NEXT_PUBLIC_SITE_URL when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://phishaware.example";
    expect(siteUrl()).toBe("https://phishaware.example");
  });

  it("lets APP_BASE_URL win, for proxied deployments", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://build-time.example";
    process.env.APP_BASE_URL = "https://runtime.example";
    expect(siteUrl()).toBe("https://runtime.example");
  });

  it("strips trailing slashes so the redirect URI matches the IdP exactly", () => {
    process.env.APP_BASE_URL = "https://phishaware.example///";
    expect(siteUrl()).toBe("https://phishaware.example");
  });

  it("ignores a blank value", () => {
    process.env.APP_BASE_URL = "   ";
    process.env.NEXT_PUBLIC_SITE_URL = "https://phishaware.example";
    expect(siteUrl()).toBe("https://phishaware.example");
  });
});

describe("ssoRedirectUri / inviteUrl", () => {
  it("build paths off the site URL with no doubled slash", () => {
    process.env.APP_BASE_URL = "https://phishaware.example/";
    expect(ssoRedirectUri()).toBe("https://phishaware.example/api/auth/sso/callback");
    expect(inviteUrl("tok123")).toBe("https://phishaware.example/invite/tok123");
  });
});
