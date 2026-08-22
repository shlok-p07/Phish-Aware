import { describe, expect, it } from "bun:test";
import {
  BrandingError,
  DEFAULT_WORKSPACE,
  MAX_WELCOME_MESSAGE,
  parseAccentColor,
  parseHttpsUrl,
  parsePracticeVectors,
  parseReportingChannel,
  readWorkspace,
  readableForeground,
} from "./orgBranding";
import { PRACTICE_VECTORS } from "./attackProfiles";

describe("parseAccentColor", () => {
  it("accepts a six-digit hex triple", () => {
    expect(parseAccentColor("#2563EB")).toBe("#2563eb");
  });

  it("treats blank and missing as no preference", () => {
    expect(parseAccentColor("")).toBeNull();
    expect(parseAccentColor("   ")).toBeNull();
    expect(parseAccentColor(null)).toBeNull();
    expect(parseAccentColor(undefined)).toBeNull();
  });

  it("refuses anything that could break out of a CSS declaration", () => {
    // This is the whole reason the check is an exact match rather than a
    // prefix or a "does it look like a colour" heuristic.
    for (const attack of [
      "#fff; background-image: url(https://tracker.example/p.gif)",
      "red; position: fixed; inset: 0",
      "#2563eb;}html{display:none",
      "var(--something)",
      "expression(alert(1))",
    ]) {
      expect(() => parseAccentColor(attack)).toThrow(BrandingError);
    }
  });

  it("refuses forms it could otherwise be tempted to normalise", () => {
    // A 3-digit shorthand and a named colour are both valid CSS. Accepting them
    // would mean two code paths for "is this a colour", and the strict one is
    // the only one worth having.
    for (const value of ["#fff", "rebeccapurple", "rgb(1,2,3)", "#12345", "#1234567"]) {
      expect(() => parseAccentColor(value)).toThrow(BrandingError);
    }
  });

  it("refuses a non-string", () => {
    expect(() => parseAccentColor(123)).toThrow(BrandingError);
    expect(() => parseAccentColor({})).toThrow(BrandingError);
  });
});

describe("parseHttpsUrl", () => {
  it("accepts an https URL", () => {
    expect(parseHttpsUrl("https://cdn.example.com/logo.png", "Logo")).toBe(
      "https://cdn.example.com/logo.png",
    );
  });

  it("refuses the schemes that turn an attribute into code", () => {
    for (const attack of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "blob:https://example.com/abc",
      "vbscript:msgbox(1)",
    ]) {
      expect(() => parseHttpsUrl(attack, "Logo")).toThrow(BrandingError);
    }
  });

  it("refuses plain http, so a logo cannot downgrade the page", () => {
    expect(() => parseHttpsUrl("http://cdn.example.com/logo.png", "Logo")).toThrow(BrandingError);
  });

  it("refuses embedded credentials", () => {
    expect(() => parseHttpsUrl("https://user:pw@cdn.example.com/l.png", "Logo")).toThrow(
      BrandingError,
    );
  });

  it("refuses something that is not a URL at all", () => {
    expect(() => parseHttpsUrl("cdn.example.com/logo.png", "Logo")).toThrow(BrandingError);
  });

  it("refuses control characters used to disguise a scheme", () => {
    expect(() => parseHttpsUrl("java\u0000script:alert(1)", "Logo")).toThrow(BrandingError);
  });
});

describe("parseReportingChannel", () => {
  it("accepts a corporate mailbox, lowercased", () => {
    expect(parseReportingChannel("Phishing@Acme.co.uk")).toBe("phishing@acme.co.uk");
  });

  it("accepts an https link to an internal form", () => {
    expect(parseReportingChannel("https://intranet.acme.com/report")).toBe(
      "https://intranet.acme.com/report",
    );
  });

  it("refuses a scheme that would run when clicked", () => {
    expect(() => parseReportingChannel("javascript:alert(1)")).toThrow(BrandingError);
  });

  it("refuses a mailto: URL, which is the href not the address", () => {
    // Accepting both shapes would mean the renderer has to guess whether to
    // prefix mailto:, and guessing wrong produces a dead link.
    expect(() => parseReportingChannel("mailto:phishing@acme.com")).toThrow(BrandingError);
  });

  it("refuses a bare word", () => {
    expect(() => parseReportingChannel("security-team")).toThrow(BrandingError);
  });
});

describe("parsePracticeVectors", () => {
  it("keeps a chosen subset in the platform's own order", () => {
    expect(parsePracticeVectors(["web", "email"])).toEqual(["email", "web"]);
  });

  it("treats every channel selected as no restriction", () => {
    // Otherwise an organisation that ticked every box today would silently
    // exclude any channel added tomorrow.
    expect(parsePracticeVectors([...PRACTICE_VECTORS])).toEqual([]);
  });

  it("de-duplicates", () => {
    expect(parsePracticeVectors(["email", "email"])).toEqual(["email"]);
  });

  it("refuses a channel the platform does not train on", () => {
    expect(() => parsePracticeVectors(["carrier-pigeon"])).toThrow(BrandingError);
    expect(() => parsePracticeVectors([{ email: true }])).toThrow(BrandingError);
  });

  it("refuses a non-list", () => {
    expect(() => parsePracticeVectors("email")).toThrow(BrandingError);
  });

  it("treats missing as no restriction", () => {
    expect(parsePracticeVectors(undefined)).toEqual([]);
    expect(parsePracticeVectors(null)).toEqual([]);
  });
});

describe("readWorkspace", () => {
  it("returns defaults for an organisation that has customised nothing", () => {
    expect(readWorkspace(undefined)).toEqual(DEFAULT_WORKSPACE);
    expect(readWorkspace({})).toEqual(DEFAULT_WORKSPACE);
    expect(readWorkspace({ seatLimit: 10 })).toEqual(DEFAULT_WORKSPACE);
  });

  it("reads a fully customised workspace", () => {
    const workspace = readWorkspace({
      branding: {
        accentColor: "#0F766E",
        logoUrl: "https://cdn.acme.com/logo.svg",
        welcomeMessage: "Welcome from the Acme security team.",
      },
      reporting: { channel: "phishing@acme.com", instructions: "Attach the original." },
      practiceVectors: ["email", "sms"],
    });
    expect(workspace.branding.accentColor).toBe("#0f766e");
    expect(workspace.reporting.channel).toBe("phishing@acme.com");
    expect(workspace.practiceVectors).toEqual(["email", "sms"]);
  });

  it("drops a bad field instead of failing the whole workspace", () => {
    // A malformed colour written by an older version, or by hand, should cost
    // the accent -- not the dashboard that reads this.
    const workspace = readWorkspace({
      branding: { accentColor: "not-a-colour", logoUrl: "javascript:alert(1)" },
      reporting: { channel: "nonsense" },
      practiceVectors: "email",
    });
    expect(workspace.branding.accentColor).toBeNull();
    expect(workspace.branding.logoUrl).toBeNull();
    expect(workspace.reporting.channel).toBeNull();
    expect(workspace.practiceVectors).toEqual([]);
  });

  it("never lets a hostile stored value through on read", () => {
    // Defence in depth: even if something bypassed the write path, the read
    // path validates too.
    const workspace = readWorkspace({
      branding: { accentColor: "#fff;}body{display:none" },
    });
    expect(workspace.branding.accentColor).toBeNull();
  });

  it("survives a settings document of the wrong shape entirely", () => {
    expect(readWorkspace({ branding: "nope", reporting: 42 })).toEqual(DEFAULT_WORKSPACE);
  });

  it("drops an over-long welcome message rather than truncating it", () => {
    const workspace = readWorkspace({
      branding: { welcomeMessage: "x".repeat(MAX_WELCOME_MESSAGE + 1) },
    });
    expect(workspace.branding.welcomeMessage).toBeNull();
  });
});

describe("readableForeground", () => {
  it("puts dark text on a light brand colour", () => {
    // The case that motivated this: a pale brand yellow with white text on it
    // is an unreadable button.
    expect(readableForeground("#fde047")).toBe("#000000");
    expect(readableForeground("#ffffff")).toBe("#000000");
  });

  it("puts light text on a dark brand colour", () => {
    expect(readableForeground("#1e3a8a")).toBe("#ffffff");
    expect(readableForeground("#000000")).toBe("#ffffff");
  });

  it("decides every colour it is given", () => {
    for (const hex of ["#2563eb", "#0f766e", "#dc2626", "#f59e0b", "#84cc16"]) {
      expect(["#000000", "#ffffff"]).toContain(readableForeground(hex));
    }
  });
});
