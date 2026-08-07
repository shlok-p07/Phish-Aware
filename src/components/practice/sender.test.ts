import { describe, it, expect } from "bun:test";
import { parseSender, isNumericSender } from "./sender";

describe("parseSender", () => {
  it("splits a Name <address> pair", () => {
    expect(parseSender("IT Support <support@corp.net>")).toEqual({
      name: "IT Support",
      email: "support@corp.net",
    });
  });

  it("strips quotes around the display name", () => {
    expect(parseSender('"Security Team" <sec@corp.net>').name).toBe("Security Team");
  });

  // An empty display name would otherwise render a blank sender row.
  it("falls back to the address when the display name is empty", () => {
    expect(parseSender("<sec@corp.net>")).toEqual({
      name: "sec@corp.net",
      email: "sec@corp.net",
    });
  });

  it("treats a bare address as both name and address", () => {
    expect(parseSender("billing@vendor.com")).toEqual({
      name: "billing@vendor.com",
      email: "billing@vendor.com",
    });
  });

  // SMS and voice scenarios have no address at all.
  it("returns no address for a plain name", () => {
    expect(parseSender("Bank Security")).toEqual({ name: "Bank Security", email: "" });
  });

  it("returns no address for a phone number", () => {
    expect(parseSender("+1 (415) 555-0110")).toEqual({
      name: "+1 (415) 555-0110",
      email: "",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseSender("  Helpdesk <help@corp.net>  ").name).toBe("Helpdesk");
  });
});

describe("isNumericSender", () => {
  it("detects a leading plus", () => {
    expect(isNumericSender("+1 (415) 555-0110")).toBe(true);
  });

  it("detects a short code", () => {
    expect(isNumericSender("28193")).toBe(true);
  });

  it("rejects a named sender", () => {
    expect(isNumericSender("Bank Security")).toBe(false);
  });

  it("ignores leading whitespace", () => {
    expect(isNumericSender("   +44 20 7946 0000")).toBe(true);
  });
});
