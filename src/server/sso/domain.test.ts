import { describe, it, expect } from "bun:test";
import { normalizeEmail, emailDomain, domainAllowed } from "./domain";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Alice@Acme.COM ")).toBe("alice@acme.com");
  });
});

describe("emailDomain", () => {
  it("extracts the domain", () => {
    expect(emailDomain("alice@acme.com")).toBe("acme.com");
  });

  it("lowercases the domain", () => {
    expect(emailDomain("Alice@ACME.com")).toBe("acme.com");
  });

  it("keeps subdomains intact", () => {
    expect(emailDomain("alice@mail.corp.acme.com")).toBe("mail.corp.acme.com");
  });

  it("uses the last @ so plus-and-at local parts still work", () => {
    expect(emailDomain('"weird@local"@acme.com')).toBe("acme.com");
  });

  it("returns null for malformed input", () => {
    for (const bad of ["", "alice", "alice@", "@acme.com", "alice@localhost", "alice@ac me.com"]) {
      expect(emailDomain(bad)).toBeNull();
    }
  });
});

describe("domainAllowed", () => {
  it("matches an allowed domain", () => {
    expect(domainAllowed("alice@acme.com", ["acme.com"])).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    expect(domainAllowed("Alice@ACME.com", ["Acme.COM"])).toBe(true);
  });

  it("tolerates whitespace in the configured list", () => {
    expect(domainAllowed("alice@acme.com", [" acme.com "])).toBe(true);
  });

  it("rejects a domain that is not listed", () => {
    expect(domainAllowed("carol@other.com", ["acme.com"])).toBe(false);
  });

  it("does not let subdomains inherit the parent", () => {
    expect(domainAllowed("alice@mail.acme.com", ["acme.com"])).toBe(false);
  });

  it("does not match a suffix lookalike", () => {
    expect(domainAllowed("alice@notacme.com", ["acme.com"])).toBe(false);
  });

  it("supports multiple allowed domains", () => {
    expect(domainAllowed("bob@sub.co", ["acme.com", "sub.co"])).toBe(true);
  });

  it("allows anything when the list is empty", () => {
    expect(domainAllowed("alice@anywhere.com", [])).toBe(true);
  });

  it("rejects a malformed address against a non-empty list", () => {
    expect(domainAllowed("not-an-email", ["acme.com"])).toBe(false);
  });
});
