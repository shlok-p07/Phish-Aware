/**
 * Contrast audit across every theme, for every text/background pairing the app
 * actually uses, with a customer accent substituted in.
 *
 * Written because fixing this one relationship at a time did not work. The
 * accent was first corrected for text on a plain card, which still left it
 * failing on a tint of itself; correcting that left high-contrast mode and the
 * muted and background surfaces unchecked. The only way to say "this works" is
 * to enumerate the combinations rather than reason about them.
 *
 * What it does:
 *
 *  - reads the token values straight out of globals.css, per theme, so the
 *    numbers here cannot drift from the stylesheet
 *  - takes the text/background pairings that appear together in the codebase
 *  - composites alpha backgrounds over their surface in sRGB, which is what a
 *    browser paints
 *  - substitutes a spread of customer accents through the same adjustment the
 *    app applies, and reports anything under the WCAG AA threshold
 *
 *   bun run scripts/audit-contrast.ts
 *   bun run scripts/audit-contrast.ts --all   # include passing rows
 */
import { readFileSync } from "node:fs";
import { accentCss } from "@/components/org-brand";

interface Hsl {
  h: number;
  s: number;
  l: number;
}
type Rgb = readonly [number, number, number];

const CSS = readFileSync("src/app/globals.css", "utf8");

/** WCAG AA: 4.5 for body text. Large text is allowed 3, but these tokens are used at both sizes. */
const AA = 4.5;
/** What "high contrast" should actually mean, or the setting is decoration. */
const AAA = 7;

function hslToRgb({ h, s, l }: Hsl): Rgb {
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

function luminance(rgb: Rgb): number {
  const lin = (v: number) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb => [
  fg[0] * alpha + bg[0] * (1 - alpha),
  fg[1] * alpha + bg[1] * (1 - alpha),
  fg[2] * alpha + bg[2] * (1 - alpha),
];

/**
 * Token values for one theme, read from the stylesheet.
 *
 * Each theme is the previous one with overrides applied, which mirrors how the
 * cascade resolves them: .dark overrides :root, and html.high-contrast overrides
 * whatever is beneath it.
 */
function tokensFor(selectors: string[]): Map<string, Hsl> {
  const out = new Map<string, Hsl>();
  for (const selector of selectors) {
    // Every block with this exact selector; :root appears more than once.
    const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
    let block: RegExpExecArray | null;
    while ((block = pattern.exec(CSS)) !== null) {
      for (const [, name, h, s, l] of block[1]!.matchAll(
        /--([a-z-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/g,
      )) {
        out.set(name!, { h: +h!, s: +s!, l: +l! });
      }
    }
  }
  return out;
}

const THEMES = [
  { name: "light", selectors: [":root"], min: AA },
  { name: "dark", selectors: [":root", ".dark"], min: AA },
  { name: "high-contrast", selectors: [":root", "html.high-contrast"], min: AAA },
  { name: "high-contrast dark", selectors: [":root", ".dark", "html.high-contrast", "html.high-contrast.dark"], min: AAA },
];

/**
 * The pairings that appear on a single element somewhere in the codebase.
 *
 * Alpha backgrounds sit over the surface behind them; for a card-based layout
 * that is --card, which is the more demanding of the two surfaces in each theme.
 */
const PAIRINGS: { text: string; bg: string; alpha: number }[] = [
  { text: "primary", bg: "card", alpha: 1 },
  { text: "primary", bg: "primary", alpha: 0.05 },
  { text: "primary", bg: "primary", alpha: 0.1 },
  { text: "primary", bg: "primary", alpha: 0.15 },
  { text: "primary", bg: "muted", alpha: 1 },
  { text: "primary", bg: "background", alpha: 1 },
  { text: "primary-foreground", bg: "primary", alpha: 1 },
  { text: "foreground", bg: "primary", alpha: 0.05 },
  { text: "foreground", bg: "primary", alpha: 0.1 },
  { text: "muted-foreground", bg: "primary", alpha: 0.1 },
  { text: "foreground", bg: "card", alpha: 1 },
  { text: "foreground", bg: "muted", alpha: 1 },
  { text: "muted-foreground", bg: "card", alpha: 1 },
  { text: "muted-foreground", bg: "muted", alpha: 1 },
  { text: "card-foreground", bg: "card", alpha: 1 },
];

/** A spread wide enough to include the shapes that broke: pale, deep, and pure. */
const ACCENTS = [
  "#2563eb", "#0f766e", "#7c3aed", "#fde047", "#84cc16",
  "#f59e0b", "#1e3a8a", "#111827", "#dc2626", "#ffffff", "#000000",
];

/**
 * The accent as the app will actually render it in this theme.
 *
 * Rules are matched by exact selector rather than by splitting the string: the
 * component now emits four of them, and ".dark{" is a substring of
 * "html.high-contrast.dark{", which silently selected the wrong tier.
 */
const SELECTOR_FOR: Record<string, string> = {
  light: ":root",
  dark: ".dark",
  "high-contrast": "html.high-contrast",
  "high-contrast dark": "html.high-contrast.dark",
};

function ruleFor(hex: string, theme: string): string {
  const selector = SELECTOR_FOR[theme]!;
  const css = accentCss(hex);
  // Anchor on the selector followed immediately by its block.
  const pattern = new RegExp(
    `(?:^|\\})${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`,
  );
  const m = pattern.exec(css);
  if (!m) throw new Error(`no rule for ${selector} in: ${css}`);
  return m[1]!;
}

function adjustedAccent(hex: string, theme: string): Hsl {
  const body = ruleFor(hex, theme);
  const m = /--primary:(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%/.exec(body)!;
  return { h: +m[1]!, s: +m[2]!, l: +m[3]! };
}

function foregroundFor(hex: string, theme: string): Hsl {
  const body = ruleFor(hex, theme);
  const m = /--primary-foreground:0 0% (\d+)%/.exec(body)!;
  return { h: 0, s: 0, l: +m[1]! };
}

function main(): void {
  const showAll = process.argv.includes("--all");
  const failures: string[] = [];
  let checked = 0;

  for (const theme of THEMES) {
    const tokens = tokensFor(theme.selectors);
    for (const accent of ACCENTS) {
      const primary = adjustedAccent(accent, theme.name);
      const primaryForeground = foregroundFor(accent, theme.name);

      const resolve = (name: string): Hsl | null => {
        if (name === "primary") return primary;
        if (name === "primary-foreground") return primaryForeground;
        return tokens.get(name) ?? null;
      };

      for (const { text, bg, alpha } of PAIRINGS) {
        const fg = resolve(text);
        const surface = resolve(bg);
        const behind = tokens.get("card");
        if (!fg || !surface || !behind) continue;
        const bgRgb = alpha === 1
          ? hslToRgb(surface)
          : over(hslToRgb(surface), hslToRgb(behind), alpha);
        const ratio = contrast(hslToRgb(fg), bgRgb);
        checked++;
        const label = `${theme.name.padEnd(19)} ${accent}  text-${text} on bg-${bg}${alpha === 1 ? "" : `/${alpha * 100}`}`;
        if (ratio < theme.min) {
          failures.push(`  FAIL ${ratio.toFixed(2).padStart(6)} (needs ${theme.min})  ${label}`);
        } else if (showAll) {
          console.log(`  ok   ${ratio.toFixed(2).padStart(6)}                ${label}`);
        }
      }
    }
  }

  console.log(`\nchecked ${checked} combinations across ${THEMES.length} themes and ${ACCENTS.length} accents`);
  if (failures.length === 0) {
    console.log("no contrast failures");
    process.exit(0);
  }
  console.log(`\n${failures.length} failing:`);
  for (const f of failures) console.log(f);
  process.exit(1);
}

main();
