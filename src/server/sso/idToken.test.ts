import { describe, it, expect } from "bun:test";
import { extractIdentity, displayName } from "./idToken";

describe("extractIdentity — email", () => {
  it("prefers the email claim and normalizes it", () => {
    expect(extractIdentity({ email: "  Alice@ACME.com " }).email).toBe("alice@acme.com");
  });

  it("falls back to preferred_username when it looks like an address", () => {
    expect(extractIdentity({ preferred_username: "alice@acme.com" }).email).toBe(
      "alice@acme.com",
    );
  });

  it("ignores preferred_username when it is a bare login name", () => {
    expect(extractIdentity({ preferred_username: "jgreenwald" }).email).toBeNull();
  });

  it("prefers email over preferred_username when both are present", () => {
    const identity = extractIdentity({
      email: "alice@acme.com",
      preferred_username: "other@acme.com",
    });
    expect(identity.email).toBe("alice@acme.com");
  });

  it("returns null when no usable address is present", () => {
    expect(extractIdentity({}).email).toBeNull();
    expect(extractIdentity({ email: "" }).email).toBeNull();
    expect(extractIdentity({ email: 42 }).email).toBeNull();
  });
});

describe("extractIdentity — email_verified", () => {
  it("reads a boolean claim", () => {
    expect(extractIdentity({ email_verified: true }).emailVerified).toBe(true);
    expect(extractIdentity({ email_verified: false }).emailVerified).toBe(false);
  });

  it("reads a stringified boolean", () => {
    expect(extractIdentity({ email_verified: "true" }).emailVerified).toBe(true);
    expect(extractIdentity({ email_verified: "false" }).emailVerified).toBe(false);
  });

  it("distinguishes an absent claim from false", () => {
    expect(extractIdentity({}).emailVerified).toBeNull();
    expect(extractIdentity({ email_verified: "maybe" }).emailVerified).toBeNull();
  });
});

describe("extractIdentity — name", () => {
  it("uses the name claim", () => {
    expect(extractIdentity({ name: "Alice Adams" }).name).toBe("Alice Adams");
  });

  it("falls back to given_name + family_name", () => {
    expect(extractIdentity({ given_name: "Alice", family_name: "Adams" }).name).toBe(
      "Alice Adams",
    );
  });

  it("handles only one of the two name parts", () => {
    expect(extractIdentity({ given_name: "Alice" }).name).toBe("Alice");
  });

  it("falls back to the email local part", () => {
    expect(extractIdentity({ email: "alice@acme.com" }).name).toBe("alice");
  });

  it("is null when nothing is available", () => {
    expect(extractIdentity({}).name).toBeNull();
  });
});

describe("extractIdentity — subject and hosted domain", () => {
  it("reads sub", () => {
    expect(extractIdentity({ sub: "auth0|abc123" }).subject).toBe("auth0|abc123");
    expect(extractIdentity({}).subject).toBeNull();
  });

  it("lowercases Google's hd claim", () => {
    expect(extractIdentity({ hd: "ACME.com" }).hostedDomain).toBe("acme.com");
    expect(extractIdentity({}).hostedDomain).toBeNull();
  });
});

describe("displayName", () => {
  it("uses a real name from the provider", () => {
    expect(displayName("Alice Adams", "Invited Name", "alice@acme.com")).toBe("Alice Adams");
  });

  it("prefers the invitation name when the provider just echoes the email", () => {
    // Auth0 does exactly this for users created by hand in the dashboard.
    expect(displayName("alice@acme.com", "Alice Adams", "alice@acme.com")).toBe("Alice Adams");
  });

  it("ignores case and whitespace when detecting the echoed email", () => {
    expect(displayName("  Alice@ACME.com ", "Alice Adams", "alice@acme.com")).toBe("Alice Adams");
  });

  it("falls back to the local part when there is no invitation name", () => {
    expect(displayName("alice@acme.com", null, "alice@acme.com")).toBe("alice");
    expect(displayName(null, null, "alice@acme.com")).toBe("alice");
    expect(displayName(null, "   ", "alice@acme.com")).toBe("alice");
  });
});
