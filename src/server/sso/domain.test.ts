import { describe, it, expect } from "bun:test";
import { normalizeEmail, emailDomain, domainAllowed, parseDomainInput } from "./domain";

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

/**
 * What a person actually types into a field labelled "domain".
 *
 * Not hypothetical: three organisations had a full email address stored in
 * theirs and one had "@northeastern.edu". A domain list is matched exactly
 * against an email's domain, so every one of those matched nothing -- the
 * sign-in page never offered SSO and no error anywhere said why.
 */
describe("parseDomainInput", () => {
  it("accepts a bare domain", () => {
    expect(parseDomainInput("example.com")).toBe("example.com");
    expect(parseDomainInput("sub.domain.example.com")).toBe("sub.domain.example.com");
  });

  it("accepts the shapes people actually typed", () => {
    expect(parseDomainInput("@northeastern.edu")).toBe("northeastern.edu");
    expect(parseDomainInput("patel.s15@northeastern.edu")).toBe("northeastern.edu");
    expect(parseDomainInput("JackCorp@JackCorp.com")).toBe("jackcorp.com");
  });

  it("normalises case and surrounding space", () => {
    expect(parseDomainInput("  Acme.CO.UK ")).toBe("acme.co.uk");
  });

  it("accepts a pasted URL, which is a fair thing to type into a domain box", () => {
    expect(parseDomainInput("https://example.com/callback")).toBe("example.com");
  });

  it("refuses anything that is not a routable domain", () => {
    for (const bad of ["", "   ", "@", "a@b", "localhost", "no dots", "192.168.0.1"]) {
      expect(parseDomainInput(bad)).toBeNull();
    }
  });

  it("refuses labels that start or end with a hyphen", () => {
    expect(parseDomainInput("-bad.com")).toBeNull();
    expect(parseDomainInput("bad-.com")).toBeNull();
  });

  it("refuses a non-string", () => {
    expect(parseDomainInput(null)).toBeNull();
    expect(parseDomainInput(42)).toBeNull();
    expect(parseDomainInput(undefined)).toBeNull();
  });

  it("produces a value domainAllowed will actually match", () => {
    // The whole point: what is stored has to match what discovery compares.
    const stored = parseDomainInput("patel.s15@northeastern.edu")!;
    expect(domainAllowed("someone.else@northeastern.edu", [stored])).toBe(true);
    expect(domainAllowed("someone@other.edu", [stored])).toBe(false);
  });
});
