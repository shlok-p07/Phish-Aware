import { describe, expect, it } from "bun:test";
import { hashPassword, verifyPassword, generateResetCode } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("verifies a password against its own hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    const a = hashPassword("same password");
    const b = hashPassword("same password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same password", a)).toBe(true);
    expect(verifyPassword("same password", b)).toBe(true);
  });

  it("returns false (not a throw) for a malformed stored hash", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
  });
});

describe("generateResetCode", () => {
  it("always returns a 6-digit numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateResetCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("is usable with hashPassword/verifyPassword like any other secret", () => {
    const code = generateResetCode();
    const hash = hashPassword(code);
    expect(verifyPassword(code, hash)).toBe(true);
    expect(verifyPassword("000000" === code ? "111111" : "000000", hash)).toBe(false);
  });
});
