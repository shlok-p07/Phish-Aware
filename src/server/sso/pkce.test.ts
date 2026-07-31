import { describe, it, expect } from "bun:test";
import {
  codeChallengeS256,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from "./pkce";

describe("codeChallengeS256", () => {
  it("matches the RFC 7636 Appendix B test vector", () => {
    expect(codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("is base64url with no padding", () => {
    expect(codeChallengeS256(generateCodeVerifier())).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is deterministic", () => {
    const verifier = generateCodeVerifier();
    expect(codeChallengeS256(verifier)).toBe(codeChallengeS256(verifier));
  });
});

describe("generateCodeVerifier", () => {
  it("stays inside RFC 7636's 43-128 character range", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("uses only unreserved characters", () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 100 }, generateCodeVerifier));
    expect(seen.size).toBe(100);
  });
});

describe("generateState / generateNonce", () => {
  it("are 64-char hex and unique", () => {
    for (const generate of [generateState, generateNonce]) {
      expect(generate()).toMatch(/^[0-9a-f]{64}$/);
      const seen = new Set(Array.from({ length: 100 }, generate));
      expect(seen.size).toBe(100);
    }
  });
});
