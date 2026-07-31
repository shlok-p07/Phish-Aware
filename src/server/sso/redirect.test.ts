import { describe, it, expect } from "bun:test";
import { safeRedirectPath } from "./redirect";

const FALLBACK = "/dashboard";

describe("safeRedirectPath", () => {
  const allowed: Array<[string, string]> = [
    ["/dashboard", "a bare path"],
    ["/learn/phishing-101", "a nested path"],
    ["/learn/x?tab=1&q=a", "a query string"],
    ["/practice#results", "a fragment"],
    ["/learn/x?a=1#b", "both"],
    ["/", "the root"],
  ];

  for (const [input, description] of allowed) {
    it(`allows ${description}: ${input}`, () => {
      expect(safeRedirectPath(input)).toBe(input);
    });
  }

  const rejected: Array<[string | null | undefined, string]> = [
    ["//evil.com", "protocol-relative"],
    ["///evil.com", "triple-slash protocol-relative"],
    ["https://evil.com", "an absolute https URL"],
    ["http://evil.com", "an absolute http URL"],
    ["javascript:alert(1)", "a javascript: scheme"],
    ["data:text/html,<script>", "a data: scheme"],
    ["/\\evil.com", "a backslash protocol-relative variant"],
    ["\\/evil.com", "a leading backslash"],
    ["\\\\evil.com", "a UNC-style path"],
    ["/path\nSet-Cookie: x", "an embedded newline"],
    ["/path\tx", "an embedded tab"],
    ["/path\u007f", "an embedded delete char"],
    ["dashboard", "a relative path with no leading slash"],
    ["", "an empty string"],
    [null, "null"],
    [undefined, "undefined"],
  ];

  for (const [input, description] of rejected) {
    it(`rejects ${description}`, () => {
      expect(safeRedirectPath(input)).toBe(FALLBACK);
    });
  }

  it("honors a custom fallback", () => {
    expect(safeRedirectPath("https://evil.com", "/admin")).toBe("/admin");
  });
});
