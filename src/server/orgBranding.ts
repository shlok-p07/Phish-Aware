import type { PracticeVector } from "./attackProfiles";
import { PRACTICE_VECTORS } from "./attackProfiles";

/**
 * Validation for everything an organisation can customise about its workspace.
 *
 * All of it is supplied by a customer's own administrator and then rendered to
 * every employee in that organisation, which makes this a trust boundary rather
 * than a settings form. An admin account is not the same thing as a trusted
 * author: it can be phished like any other, and the whole product exists because
 * that happens. So each field is validated to the narrowest shape that can still
 * express what it is for, and anything else is rejected outright rather than
 * sanitised into something approximate.
 *
 * The specific hazards, since they are not obvious from the field names:
 *
 * - accentColor ends up in a CSS custom property. A value like
 *   `#fff; background-image: url(https://tracker.example/p.gif)` would break out
 *   of the declaration, so only an exact 6-digit hex triple is accepted -- not a
 *   named colour, not rgb(), not a 3-digit shorthand.
 * - logoUrl and reportingChannel end up in `src` and `href`. `javascript:` and
 *   `data:` URLs are the reason both are restricted to https, and why the parse
 *   goes through the URL constructor rather than a regex on the string.
 * - welcomeMessage is rendered as text by React, which escapes it. It is capped
 *   for layout, not safety -- but it must never be passed to
 *   dangerouslySetInnerHTML, which is why nothing here returns HTML.
 */

/** Long enough for a short note from a security team, short enough to render. */
export const MAX_WELCOME_MESSAGE = 280;
/** Enough for "Forward it to phishing@example.com and delete it." */
export const MAX_REPORTING_INSTRUCTIONS = 400;
const MAX_URL_LENGTH = 512;

export interface OrgBranding {
  /** Exact `#rrggbb`, or null to use the product's own accent. */
  accentColor: string | null;
  /** An https image URL, or null for the organisation's initials. */
  logoUrl: string | null;
  /** Plain text shown to employees on their dashboard. */
  welcomeMessage: string | null;
}

export interface OrgReporting {
  /**
   * Where a real phishing email should actually go: an email address or an
   * https URL to an internal form.
   *
   * The most valuable thing an organisation can configure here. Training that
   * ends with "report it to your security team" teaches nothing actionable;
   * training that ends with the actual address employees should use is the
   * behaviour being trained.
   */
  channel: string | null;
  /** Any extra steps, e.g. "attach the original as .eml". */
  instructions: string | null;
}

export interface OrgWorkspace {
  /** The organisation's name, so an employee can see whose workspace this is. */
  orgName: string | null;
  branding: OrgBranding;
  reporting: OrgReporting;
  /**
   * The channels this organisation trains on.
   *
   * A warehouse has no reason to drill Slack DMs, and a team that has never been
   * issued a company phone will read an SMS scenario as irrelevant rather than
   * as practice. Empty means all of them.
   */
  practiceVectors: PracticeVector[];
}

export const DEFAULT_WORKSPACE: OrgWorkspace = {
  orgName: null,
  branding: { accentColor: null, logoUrl: null, welcomeMessage: null },
  reporting: { channel: null, instructions: null },
  practiceVectors: [],
};

/** Exactly `#rrggbb`. Deliberately strict -- see the note above. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * A conservative email check.
 *
 * Not RFC 5322 -- that grammar admits quoted strings and comments, which are
 * legal and would be a hostile thing to render into an href. This accepts the
 * shape real corporate mailboxes actually take.
 */
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * C0 controls and DEL, written as escapes.
 *
 * Spelled out rather than typed literally: control characters in source are
 * invisible to a reviewer, which is the same property that makes them worth
 * rejecting in stored text.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export class BrandingError extends Error {}

/**
 * Trims, and turns blank into null so "clear this field" has one meaning.
 *
 * Exported for the fields that need nothing beyond length and control-character
 * checks -- a welcome message and reporting instructions are free text, rendered
 * escaped by React.
 */
export function parsePlainText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new BrandingError(`${field} must be text`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new BrandingError(`${field} can't be longer than ${max} characters`);
  }
  if (CONTROL_CHARS.test(trimmed)) {
    throw new BrandingError(`${field} can't contain control characters`);
  }
  return trimmed;
}

export function parseAccentColor(value: unknown): string | null {
  // Deliberately generous on length here so the format check is what reports
  // the problem. Capped at exactly 7 it was technically correct and useless:
  // pasting a CSS breakout attempt got "can't be longer than 7 characters"
  // rather than "must be a hex value", which tells an admin nothing about the
  // shape actually wanted.
  const text = parsePlainText(value, "Accent colour", 64);
  if (text === null) return null;
  if (!HEX_COLOR.test(text)) {
    throw new BrandingError("Accent colour must be a hex value like #2563eb");
  }
  return text.toLowerCase();
}

export function parseHttpsUrl(value: unknown, field: string): string | null {
  const text = parsePlainText(value, field, MAX_URL_LENGTH);
  if (text === null) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BrandingError(`${field} must be a full URL starting with https://`);
  }
  // Scheme allowlist, not a blocklist: `javascript:`, `data:` and `blob:` are
  // the ones that matter today, and an allowlist stays correct as others appear.
  if (url.protocol !== "https:") {
    throw new BrandingError(`${field} must use https://`);
  }
  // Credentials in a URL are never intended here and would be rendered in the
  // page source.
  if (url.username || url.password) {
    throw new BrandingError(`${field} can't contain a username or password`);
  }
  return url.toString();
}

/** An email address or an https URL -- both are real ways to report a phish. */
export function parseReportingChannel(value: unknown): string | null {
  const text = parsePlainText(value, "Reporting channel", MAX_URL_LENGTH);
  if (text === null) return null;
  if (EMAIL.test(text)) return text.toLowerCase();
  if (/^https:\/\//i.test(text)) return parseHttpsUrl(text, "Reporting channel");
  throw new BrandingError("Reporting channel must be an email address or an https:// link");
}

export function parsePracticeVectors(value: unknown): PracticeVector[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new BrandingError("Practice channels must be a list");
  const seen = new Set<PracticeVector>();
  for (const entry of value) {
    if (typeof entry !== "string" || !PRACTICE_VECTORS.includes(entry as PracticeVector)) {
      throw new BrandingError(`"${String(entry)}" is not a channel this platform trains on`);
    }
    seen.add(entry as PracticeVector);
  }
  // All of them selected is the same as no restriction; store it as no
  // restriction so adding a vector later does not silently exclude it from
  // every organisation that had ticked every box.
  if (seen.size === PRACTICE_VECTORS.length) return [];
  return PRACTICE_VECTORS.filter((v) => seen.has(v));
}

/**
 * Reads a stored workspace, tolerating anything.
 *
 * Settings predate this feature and are typed only as `object` at the database
 * layer, so a document can hold whatever an older version wrote. Every field
 * falls back to the default rather than throwing: a malformed colour should cost
 * an organisation its accent, not its dashboard.
 */
export function readWorkspace(settings: unknown, orgName: string | null = null): OrgWorkspace {
  const raw = (settings ?? {}) as Record<string, unknown>;
  const branding = (raw.branding ?? {}) as Record<string, unknown>;
  const reporting = (raw.reporting ?? {}) as Record<string, unknown>;
  const safe = <T>(read: () => T, fallback: T): T => {
    try {
      return read();
    } catch {
      return fallback;
    }
  };
  return {
    orgName,
    branding: {
      accentColor: safe(() => parseAccentColor(branding.accentColor), null),
      logoUrl: safe(() => parseHttpsUrl(branding.logoUrl, "Logo"), null),
      welcomeMessage: safe(
        () => parsePlainText(branding.welcomeMessage, "Welcome message", MAX_WELCOME_MESSAGE),
        null,
      ),
    },
    reporting: {
      channel: safe(() => parseReportingChannel(reporting.channel), null),
      instructions: safe(
        () => parsePlainText(reporting.instructions, "Instructions", MAX_REPORTING_INSTRUCTIONS),
        null,
      ),
    },
    practiceVectors: safe(() => parsePracticeVectors(raw.practiceVectors), []),
  };
}

/**
 * Readable foreground for a background of this colour.
 *
 * An admin picking their brand's pale yellow would otherwise get white text on
 * it and an unreadable button. Relative luminance per WCAG, with the 0.179
 * threshold that maximises the worse of the two contrast ratios.
 */
export function readableForeground(hex: string): "#000000" | "#ffffff" {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
