import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { accentCss, hexToHsl, legibleLightness, OrgAccent, OrgLogo } from "./org-brand";

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
    expect(css).toMatch(/--primary:\d+ \d+% \d+%/);
    expect(css).toMatch(/--ring:\d+ \d+% \d+%/);
    expect(css).not.toContain("#0f766e");
  });

  it("styles dark mode too, not only :root", () => {
    // .dark sets --primary itself, so overriding only :root left dark mode with
    // a value tuned for a white background.
    const { container } = render(<OrgAccent accentColor="#0f766e" />);
    const css = styleText(container);
    expect(css).toContain(":root{");
    expect(css).toContain(".dark{");
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

  it("picks a foreground that is readable on the adjusted accent", () => {
    // Black or white, whichever wins -- asserted by contrast rather than by
    // hardcoding, since the adjusted lightness decides which one that is.
    for (const hex of ["#fde047", "#1e3a8a", "#2563eb", "#0f766e"]) {
      const { container } = render(<OrgAccent accentColor={hex} />);
      const css = styleText(container);
      for (const rule of [css.split(".dark{")[0]!, css.split(".dark{")[1]!]) {
        const primary = /--primary:(\d+) (\d+)% (\d+)%/.exec(rule)!;
        const fg = /--primary-foreground:0 0% (\d+)%/.exec(rule)!;
        const accent = { h: +primary[1]!, s: +primary[2]!, l: +primary[3]! };
        const onWhite = contrastRatio(accent, { h: 0, s: 0, l: 100 });
        const onBlack = contrastRatio(accent, { h: 0, s: 0, l: 0 });
        const chose = fg[1] === "100" ? onWhite : onBlack;
        expect(chose).toBeGreaterThanOrEqual(Math.max(onWhite, onBlack) - 0.001);
        expect(chose).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

/** WCAG relative luminance and contrast, so the tests assert legibility directly. */
function luminance({ h, s, l }: { h: number; s: number; l: number }): number {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60) % 6;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][sector]!;
  const lin = (v: number) => {
    const n = ((v + m) * 255) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: { h: number; s: number; l: number }, b: { h: number; s: number; l: number }) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type Hsl = { h: number; s: number; l: number };

/** HSL to sRGB channels, so a tint can be composited the way a browser does. */
function toRgb({ h, s, l }: Hsl): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60) % 6;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][sector]!;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function lumRgb(rgb: [number, number, number]): number {
  const lin = (v: number) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/**
 * The accent at 15% over the card, which is what bg-primary/15 renders.
 *
 * Composited in sRGB, because that is what a browser does for alpha blending.
 * Mixing luminances instead overstates the tint on a dark card and made this
 * assertion disagree with the component for no good reason.
 */
function tintedContrast(accent: Hsl, card: Hsl) {
  const fg = toRgb(accent);
  const bg = toRgb(card);
  const mixed: [number, number, number] = [
    fg[0] * 0.15 + bg[0] * 0.85,
    fg[1] * 0.15 + bg[1] * 0.85,
    fg[2] * 0.15 + bg[2] * 0.85,
  ];
  const a = lumRgb(fg);
  const b = lumRgb(mixed);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The card surfaces from globals.css, which accent text actually sits on. */
const LIGHT_CARD = { h: 0, s: 0, l: 100 };
const DARK_CARD = { h: 222, s: 24, l: 11 };

describe("accent legibility", () => {
  // Every one of these failed AA in at least one theme before the fix, the
  // product's own default blue included, at 3.40 on dark. A pale brand yellow
  // scored 1.32 on a white card.
  const ACCENTS = [
    "#2563eb", "#0f766e", "#7c3aed", "#fde047", "#84cc16",
    "#f59e0b", "#1e3a8a", "#111827", "#dc2626", "#ffffff", "#000000",
  ];

  it("keeps accent text readable on a tint of itself, in light mode", () => {
    // The case that actually looked wrong: 23 places pair bg-primary/10 or /15
    // with text-primary, so the accent is both the text and the surface behind
    // it. Measured against the bare card the default blue still came out at
    // 4.19 on a 15% tint.
    for (const hex of ACCENTS) {
      const base = hexToHsl(hex);
      const adjusted = { ...base, l: legibleLightness(base, LIGHT_CARD) };
      expect(tintedContrast(adjusted, LIGHT_CARD)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps accent text readable on a tint of itself, in dark mode", () => {
    for (const hex of ACCENTS) {
      const base = hexToHsl(hex);
      const adjusted = { ...base, l: legibleLightness(base, DARK_CARD) };
      expect(tintedContrast(adjusted, DARK_CARD)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("also clears the bare card, which is the easier surface", () => {
    for (const hex of ACCENTS) {
      const base = hexToHsl(hex);
      for (const card of [LIGHT_CARD, DARK_CARD]) {
        const adjusted = { ...base, l: legibleLightness(base, card) };
        expect(contrastRatio(adjusted, card)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("preserves the brand hue and saturation, moving only lightness", () => {
    // The point of the trade: a customer picked a colour, so keep what makes it
    // theirs and change only what makes it unreadable.
    const base = hexToHsl("#fde047");
    for (const surface of [LIGHT_CARD, DARK_CARD]) {
      const adjusted = { ...base, l: legibleLightness(base, surface) };
      expect(adjusted.h).toBe(base.h);
      expect(adjusted.s).toBe(base.s);
    }
  });

  it("leaves an already-legible accent where it was", () => {
    // No gratuitous shifting: a colour that already passes is only rounded to
    // the whole percent that actually gets emitted, not moved.
    const base = hexToHsl("#1e3a8a");
    expect(legibleLightness(base, LIGHT_CARD)).toBe(Math.round(base.l));
  });

  it("darkens for light surfaces and lightens for dark ones", () => {
    const pale = hexToHsl("#fde047");
    expect(legibleLightness(pale, LIGHT_CARD)).toBeLessThan(pale.l);
    const deep = hexToHsl("#111827");
    expect(legibleLightness(deep, DARK_CARD)).toBeGreaterThan(deep.l);
  });

  it("emits a different lightness per theme, since one cannot serve both", () => {
    const css = accentCss("#fde047");
    const light = /:root\{--primary:\d+ \d+% (\d+)%/.exec(css)![1];
    const dark = /\.dark\{--primary:\d+ \d+% (\d+)%/.exec(css)![1];
    expect(light).not.toBe(dark);
  });

  it("never emits a lightness outside 0-100", () => {
    for (const hex of ACCENTS) {
      const base = hexToHsl(hex);
      for (const surface of [LIGHT_CARD, DARK_CARD]) {
        const l = legibleLightness(base, surface);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThanOrEqual(100);
      }
    }
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

describe("accent legibility in high contrast", () => {
  // The high-contrast setting already pushes the stylesheet's own tokens
  // further; the accent was the one colour that ignored it, so a reader who
  // asked for more contrast got AA-level accent text regardless. Audited across
  // four themes and eleven accents, that was all 109 remaining failures.
  const ACCENTS_HC = ["#2563eb", "#0f766e", "#7c3aed", "#fde047", "#1e3a8a", "#dc2626"];

  it("emits a rule for each theme the stylesheet defines", () => {
    const css = accentCss("#2563eb");
    expect(css).toContain(":root{");
    expect(css).toContain(".dark{");
    expect(css).toContain("html.high-contrast{");
    expect(css).toContain("html.high-contrast.dark{");
  });

  it("reaches AAA on the tinted surface when high contrast is on", () => {
    for (const hex of ACCENTS_HC) {
      const base = hexToHsl(hex);
      for (const card of [LIGHT_CARD, DARK_CARD]) {
        const adjusted = { ...base, l: legibleLightness(base, card, 7) };
        expect(tintedContrast(adjusted, card)).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("asks more of high contrast than of the normal themes", () => {
    // Otherwise the setting is decoration.
    const base = hexToHsl("#2563eb");
    const normal = legibleLightness(base, LIGHT_CARD, 4.5);
    const high = legibleLightness(base, LIGHT_CARD, 7);
    expect(high).toBeLessThan(normal);
  });

  it("emits whole percentages, so what ships is what was verified", () => {
    // Solving on a fractional lightness let a value verified at 7.00 ship as
    // 6.99 once channels() rounded it.
    const css = accentCss("#0f766e");
    for (const [, l] of css.matchAll(/--primary:\d+ \d+% (\d+(?:\.\d+)?)%/g)) {
      expect(Number.isInteger(Number(l))).toBe(true);
    }
  });
});
