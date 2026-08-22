"use client";

import Image from "next/image";
import { useState } from "react";
import { Building2 } from "lucide-react";

/**
 * Applies an organisation's own colour to the app.
 *
 * The value is written as CSS custom properties on a <style> element scoped to
 * :root, which is the one place a single colour can retint buttons, links and
 * focus rings without every component knowing about branding.
 *
 * Injecting a string into CSS is exactly the kind of thing that goes wrong, so
 * the value is checked again here even though the server already validated it on
 * write and on read. Three independent checks is not paranoia for a value that
 * originates from a form, crosses the network, and lands in a stylesheet: it
 * costs one regex, and the failure mode it prevents is an organisation's admin
 * account being used to restyle or cover the UI its own employees see.
 *
 * The foreground is computed rather than configurable. An admin who picks their
 * brand's pale yellow should not end up with white-on-yellow buttons, and asking
 * them to choose a text colour too would just move the problem.
 */
const SAFE_HEX = /^#[0-9a-f]{6}$/i;

/**
 * The surfaces an accent has to be legible against, as HSL lightness.
 *
 * Taken from globals.css: --card is 0 0% 100% in light and 222 24% 11% in dark.
 * Cards are what accent text actually sits on, and they are the more demanding
 * of the two surfaces in each theme.
 */
const LIGHT_CARD: Hsl = { h: 0, s: 0, l: 100 };
const DARK_CARD: Hsl = { h: 222, s: 24, l: 11 };

/** WCAG AA for normal-size text. `text-primary` is used at body size, so 3:1 is not enough. */
const MIN_CONTRAST = 4.5;

/**
 * What the high-contrast setting has to actually deliver.
 *
 * globals.css already pushes its own tokens further when html.high-contrast is
 * set -- vector foregrounds go from 36% to 26% lightness, and muted foregrounds
 * tighten too. The accent was the one colour that ignored the setting: an
 * organisation with a custom accent got AA-level text no matter what the reader
 * had asked for. Audited across four themes and eleven accents, that was all 109
 * of the remaining failures, and every one of them was here.
 */
const MIN_CONTRAST_HIGH = 7;

/**
 * Solved for slightly above the bar rather than exactly on it.
 *
 * Aiming at the threshold itself leaves the result on a knife edge: rounding the
 * lightness to a whole percent, and floating-point noise in the ratio, both put
 * a value verified at 4.50 on the wrong side of 4.50. A tenth of a point costs
 * nothing perceptually and makes the guarantee hold.
 */
const CONTRAST_MARGIN = 0.1;

/**
 * The heaviest accent tint the app paints behind accent-coloured text.
 *
 * 23 places combine `bg-primary/10` or `bg-primary/15` with `text-primary`:
 * avatar initials, step numbers, the selected practice option, icon tiles. That
 * is the accent mixed into both the text and the surface behind it, and it is
 * the case that actually looked wrong. Checking contrast against the bare card
 * is not enough -- measured that way the default blue still came out at 4.19 on
 * a 15% tint, and the worst accent at 3.75. So the target is the tinted
 * background, which is what is really rendered.
 */
const TINT_ALPHA = 0.15;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: l * 100 };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

function channelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

type Rgb = readonly [number, number, number];

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const sector = Math.floor(((((h % 360) + 360) % 360)) / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector]!;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Relative luminance, per WCAG. */
function luminance(rgb: Rgb): number {
  return (
    0.2126 * channelToLinear(rgb[0]) +
    0.7152 * channelToLinear(rgb[1]) +
    0.0722 * channelToLinear(rgb[2])
  );
}

/** `foreground` at `alpha` composited over `background`, which is what a /15 tint is. */
function composite(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
  ];
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Contrast of an accent against the worst surface it is drawn on: a tint of
 * itself over the card.
 */
function accentContrast(accent: Hsl, card: Hsl): number {
  const rgb = hslToRgb(accent);
  const tinted = composite(rgb, hslToRgb(card), TINT_ALPHA);
  return contrast(rgb, tinted);
}

/**
 * The nearest lightness to what the admin chose that is still legible.
 *
 * This is the fix for the reported problem. A single accent has to serve as a
 * button background *and* as body text via `text-primary`, on both a white card
 * and a near-black one, and no single lightness does all four: measured against
 * the real tokens, every colour tried failed AA in one theme or the other --
 * including the product's own default blue, at 3.40 on dark. A pale brand yellow
 * scored 1.32 on a white card, which is the "mixing into both colours" that
 * makes text hard to read.
 *
 * Hue and saturation are left exactly as chosen, because that is what a brand
 * colour actually is; only lightness moves, and only as far as it must. Light
 * themes darken, dark themes lighten. A very pale accent therefore renders as a
 * deeper version of the same hue rather than as an unreadable wash -- a visible
 * change, and the right trade against text nobody can read.
 */
export function legibleLightness(base: Hsl, card: Hsl, minContrast = MIN_CONTRAST): number {
  // Solved on whole percentages, because that is what gets emitted: channels()
  // rounds, and solving on the fractional value let a result verified at 7.00
  // ship as 6.99 once rounded. Verify the number you are actually going to use.
  const target = minContrast + CONTRAST_MARGIN;
  const start = { ...base, l: Math.round(base.l) };
  if (accentContrast(start, card) >= target) return start.l;
  // Move away from the surface: darken on light, lighten on dark.
  const step = card.l > 50 ? -1 : 1;
  let l = start.l;
  for (let i = 0; i < 100; i++) {
    l += step;
    if (l < 0 || l > 100) break;
    if (accentContrast({ ...base, l }, card) >= target) return l;
  }
  // A hue with no lightness that clears the bar at all -- only reachable at the
  // AAA threshold for a few saturated hues. Land on the extreme, which is the
  // most legible value available rather than an arbitrary one.
  return card.l > 50 ? 0 : 100;
}

/** Black or white channels, whichever is readable on this colour. */
function readableForeground(colour: Hsl): string {
  const own = hslToRgb(colour);
  const white = hslToRgb({ h: 0, s: 0, l: 100 });
  const black = hslToRgb({ h: 0, s: 0, l: 0 });
  return contrast(own, white) >= contrast(own, black) ? "0 0% 100%" : "0 0% 0%";
}

/** `H S% L%`, the shape the theme's tokens are stored in. */
function channels({ h, s, l }: Hsl): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

export function accentCss(hex: string): string {
  const base = hexToHsl(hex);

  const rule = (selector: string, card: Hsl, minContrast: number) => {
    const solved = { ...base, l: legibleLightness(base, card, minContrast) };
    return (
      `${selector}{--primary:${channels(solved)};` +
      `--primary-foreground:${readableForeground(solved)};` +
      `--ring:${channels(solved)};}`
    );
  };

  // One rule per theme in globals.css, in cascade order. A single value cannot
  // be legible on both a white card and a near-black one, and the high-contrast
  // setting asks for more than AA on top of that -- so each combination is
  // solved separately rather than approximated by one compromise.
  return [
    rule(":root", LIGHT_CARD, MIN_CONTRAST),
    rule(".dark", DARK_CARD, MIN_CONTRAST),
    rule("html.high-contrast", LIGHT_CARD, MIN_CONTRAST_HIGH),
    rule("html.high-contrast.dark", DARK_CARD, MIN_CONTRAST_HIGH),
  ].join("");
}

export function OrgAccent({ accentColor }: { accentColor: string | null | undefined }) {
  if (!accentColor || !SAFE_HEX.test(accentColor)) return null;

  // Not user-authored markup: a validated hex reduced to numbers inside a fixed
  // template. There is no other way to set a custom property at :root from a
  // client component, and a style attribute on a wrapper would not reach the
  // tokens components already consume.
  return <style dangerouslySetInnerHTML={{ __html: accentCss(accentColor) }} />;
}

/**
 * An organisation's logo, falling back to the product mark.
 *
 * Remote images fail: a CDN moves, a URL rots, an employee is on a network that
 * blocks it. A broken-image icon in the corner of the sidebar looks like the
 * product is broken, so a failure falls back to the same placeholder an
 * organisation with no logo gets.
 *
 * referrerPolicy is set because the logo host is third-party by definition, and
 * it should not learn which pages of an internal tool employees are on.
 */
export function OrgLogo({
  logoUrl,
  orgName,
  className = "",
}: {
  logoUrl: string | null | undefined;
  orgName: string | null | undefined;
  className?: string;
}) {
  // Which URL failed, rather than a boolean: a new URL then gets a fresh
  // attempt for free, where a flag would need an effect to reset it -- and
  // resetting state from an effect is both an extra render and the thing the
  // React Compiler rules flag.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const usable = logoUrl && /^https:\/\//i.test(logoUrl) && failedUrl !== logoUrl;

  if (!usable) {
    return (
      <span
        className={`flex items-center justify-center rounded-md bg-primary/10 text-primary ${className}`}
        aria-hidden="true"
      >
        <Building2 className="h-4 w-4" />
      </span>
    );
  }

  return (
    <Image
      src={logoUrl}
      alt={orgName ? `${orgName} logo` : "Organisation logo"}
      width={28}
      height={28}
      // Arbitrary customer CDNs cannot all be listed in next.config, and
      // optimising someone else's logo is not worth proxying every request.
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(logoUrl)}
      className={`rounded-md object-contain ${className}`}
    />
  );
}
