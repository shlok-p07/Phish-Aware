import { describe, it, expect } from "bun:test";
import { redactEmail, shortId } from "./redact";

describe("redactEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(redactEmail("alice.smith@acme.test")).toBe("a***@acme.test");
  });

  it("keeps the domain, because allowlist failures are diagnosed by domain", () => {
    expect(redactEmail("bob@sub.example.co.uk")).toContain("@sub.example.co.uk");
  });

  it("does not leak the length of the local part", () => {
    expect(redactEmail("a@x.test")).toBe("a***@x.test");
    expect(redactEmail("averylonglocalpart@x.test")).toBe("a***@x.test");
  });

  it("splits on the last @, so a quoted local part cannot smuggle a domain", () => {
    expect(redactEmail('"weird@thing"@real.test')).toBe('"***@real.test');
  });

  it("refuses anything that is not an address", () => {
    for (const bad of ["", "no-at-sign", "@leading", "trailing@", null, undefined]) {
      expect(redactEmail(bad as string)).toBe("[redacted]");
    }
  });
});

describe("shortId", () => {
  it("truncates to twelve characters", () => {
    expect(shortId("6a7670e0e11ee0e467c0b693")).toBe("6a7670e0e11e");
  });

  it("leaves an already-short value alone", () => {
    expect(shortId("abc")).toBe("abc");
  });

  it("reports absence rather than throwing", () => {
    expect(shortId(null)).toBe("[none]");
    expect(shortId(undefined)).toBe("[none]");
  });

  it("accepts anything with toString, such as an ObjectId", () => {
    expect(shortId({ toString: () => "0123456789abcdef" })).toBe("0123456789ab");
  });
});
