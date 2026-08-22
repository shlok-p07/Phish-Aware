import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { hexToHslChannels, OrgAccent, OrgLogo } from "./org-brand";

/**
 * The accent colour reaches a stylesheet, so these tests are mostly about what
 * must never end up there. The server validates on write and again on read;
 * this is the last of the three checks, and the one closest to the injection
 * point.
 */
describe("OrgAccent", () => {
  const styleText = (container: HTMLElement) =>
    container.querySelector("style")?.textContent ?? "";

  it("sets the accent tokens as HSL channels, which is what the theme consumes", () => {
    // The tokens are bare channels read through hsl(var(--primary)). Emitting a
    // hex produced hsl(#0f766e) -- invalid CSS, silently dropped, so branding
    // appeared to save and then do nothing.
    const { container } = render(<OrgAccent accentColor="#0f766e" />);
    const css = styleText(container);
    expect(css).toContain(`--primary:${hexToHslChannels("#0f766e")}`);
    expect(css).toContain(`--ring:${hexToHslChannels("#0f766e")}`);
    expect(css).not.toContain("#0f766e");
  });

  it("renders nothing when no colour is set", () => {
    for (const value of [null, undefined, ""]) {
      const { container } = render(<OrgAccent accentColor={value} />);
      expect(container.querySelector("style")).toBeNull();
    }
  });

  it("renders nothing rather than emitting a hostile value", () => {
    // If any of these produced a <style> element, the value would be live CSS.
    for (const attack of [
      "#fff; background-image: url(https://tracker.example/p.gif)",
      "#2563eb;}html{display:none",
      "red",
      "#fff",
      "var(--x)",
      "expression(alert(1))",
      "</style><script>alert(1)</script>",
    ]) {
      const { container } = render(<OrgAccent accentColor={attack} />);
      expect(container.querySelector("style")).toBeNull();
    }
  });

  it("picks a readable foreground for the colour it is given", () => {
    // A pale brand colour with white text on it is an unreadable button.
    const light = render(<OrgAccent accentColor="#fde047" />);
    expect(styleText(light.container)).toContain("--primary-foreground:0 0% 0%");

    const dark = render(<OrgAccent accentColor="#1e3a8a" />);
    expect(styleText(dark.container)).toContain("--primary-foreground:0 0% 100%");
  });
});

describe("hexToHslChannels", () => {
  it("converts the primaries", () => {
    expect(hexToHslChannels("#ff0000")).toBe("0 100% 50%");
    expect(hexToHslChannels("#00ff00")).toBe("120 100% 50%");
    expect(hexToHslChannels("#0000ff")).toBe("240 100% 50%");
  });

  it("handles greys, where hue and saturation are undefined", () => {
    expect(hexToHslChannels("#000000")).toBe("0 0% 0%");
    expect(hexToHslChannels("#ffffff")).toBe("0 0% 100%");
    expect(hexToHslChannels("#808080")).toBe("0 0% 50%");
  });

  it("round-trips a real brand colour to the theme's own format", () => {
    // Matches the shape of the tokens in globals.css: "221 70% 40%".
    expect(hexToHslChannels("#0f766e")).toMatch(/^\d{1,3} \d{1,3}% \d{1,3}%$/);
  });
});

describe("OrgLogo", () => {
  it("renders the logo when the URL is https", () => {
    const { container } = render(
      <OrgLogo logoUrl="https://cdn.example.com/logo.png" orgName="Acme" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("alt")).toBe("Acme logo");
  });

  it("does not leak which pages employees are on to the logo host", () => {
    const { container } = render(
      <OrgLogo logoUrl="https://cdn.example.com/logo.png" orgName="Acme" />,
    );
    expect(container.querySelector("img")!.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("falls back to the placeholder rather than rendering a hostile src", () => {
    for (const attack of ["javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "http://cdn.example.com/l.png"]) {
      const { container } = render(<OrgLogo logoUrl={attack} orgName="Acme" />);
      expect(container.querySelector("img")).toBeNull();
    }
  });

  it("falls back when there is no logo at all", () => {
    const { container } = render(<OrgLogo logoUrl={null} orgName="Acme" />);
    expect(container.querySelector("img")).toBeNull();
    // The placeholder is decorative; the org name is already text beside it.
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("still names the image when the organisation has no name", () => {
    const { container } = render(
      <OrgLogo logoUrl="https://cdn.example.com/logo.png" orgName={null} />,
    );
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("Organisation logo");
  });
});
