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

describe("generateResetCode uniformity", () => {
  /*
   * The `% 1_000_000` this replaced was biased, and the exact numbers decide
   * what threshold can actually separate the two implementations.
   *
   * Three bytes span 0..16_777_215, and 16_777_216 mod 1_000_000 is 777_216, so
   * each code below 777_216 had 17 preimages and each code at or above it had
   * 16. That puts P(code < 777_216) at 0.787537 where uniform is 0.777216 -- a
   * bias of 0.010321, not the "6%" a first pass at this suggested.
   *
   * At 200_000 draws the standard error is 0.00093, so the bias sits 11 sigma
   * out. A 0.005 threshold is 5.4 sigma from uniform (it will not flake) and
   * under half the bias (it will catch a regression). The first version of this
   * test used 0.012 -- wider than the bias itself -- so it passed against the
   * biased implementation too: worse than no test, because it looked like
   * coverage. Verified by reverting the source and watching this fail.
   */
  it("does not favour the low end of the keyspace", () => {
    const draws = 200_000;
    const boundary = 777_216;
    const uniformShare = boundary / 1_000_000;
    let low = 0;
    for (let i = 0; i < draws; i++) {
      if (Number(generateResetCode()) < boundary) low += 1;
    }
    expect(Math.abs(low / draws - uniformShare)).toBeLessThan(0.005);
  });

  it("can still reach both ends of the range", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i++) seen.add(generateResetCode().slice(0, 1));
    // All ten leading digits should appear; an off-by-one in the rejection
    // bound would lop off the top of the space.
    expect(seen.size).toBe(10);
  });
});
