import type { CueId } from "@/server/cues";

/**
 * Where in the rendered email each cue actually lives. Four cue types don't
 * appear in the body at all -- they point at structured fields the mail client
 * already renders as their own elements (the sender line, the links list, the
 * attachments footer), so we highlight that whole region rather than trying to
 * find a phrase in the body. The remaining four are body-text cues that we
 * best-effort locate via a small keyword lexicon (see findBodyMatch).
 */
export type CueRegion = "sender" | "body" | "links" | "attachments";

export const CUE_REGION: Record<CueId, CueRegion> = {
  sender_domain: "sender",
  mismatched_link: "links",
  unexpected_attachment: "attachments",
  suspicious_qr: "attachments",
  urgency_language: "body",
  credential_request: "body",
  generic_greeting: "body",
  spelling_grammar: "body",
};

/**
 * Per-cue keyword lists used only for the body-anchored cues. Scenario bodies
 * are free LLM text with no fixed markers, so this is intentionally a wide,
 * fuzzy net: we highlight the first phrase that matches, and highlight nothing
 * if none do (the cue chip still self-highlights either way). Kept small on
 * purpose -- it's a hint, not a parser.
 */
export const BODY_CUE_KEYWORDS: Partial<Record<CueId, string[]>> = {
  urgency_language: [
    "within 24 hours",
    "in 24 hours",
    "immediately",
    "right away",
    "as soon as possible",
    "asap",
    "expires",
    "expire",
    "suspended",
    "suspend",
    "deactivat",
    "closes tonight",
    "closes today",
    "before end of day",
    "before the end of the day",
    "urgent",
    "urgently",
    "act now",
    "action required",
    "time-sensitive",
    "time sensitive",
    "final notice",
    "last chance",
    "mandatory",
    "required",
    "must",
    "do not delay",
    "avoid losing",
    "or you will",
    "before your access",
  ],
  credential_request: [
    "employee id and password",
    "username and password",
    "verify your credentials",
    "confirm your password",
    "verify your account",
    "validate their login credentials",
    "login credentials",
    "confirm your identity",
    "confirm your account",
    "confirm your details",
    "account details",
    "payment information",
    "payment details",
    "credit card",
    "banking details",
    "social security",
    "password",
    "credentials",
    "log in",
    "sign in",
  ],
  // Generic greetings are the *opening* of the email -- match the impersonal
  // salutation lines. "Hello Team" / "Dear Team" address a group, not a person.
  generic_greeting: [
    "dear user",
    "dear customer",
    "dear member",
    "dear winner",
    "dear employee",
    "dear team",
    "dear all",
    "dear sir or madam",
    "dear sir/madam",
    "dear valued customer",
    "to whom it may concern",
    "hello team",
    "hi team",
    "hello all",
    "hello everyone",
    "hello,",
    "hi there,",
    "greetings,",
  ],
  spelling_grammar: [],
};

const WORD_CHAR = /[a-z0-9]/i;

// Whole-word-ish check so short keywords ("must", "log in") don't match inside
// longer words ("mustard", "blog in..."). Multi-word phrases are exempt on the
// interior; we only guard the outer edges.
function isWordBoundaryMatch(haystack: string, start: number, end: number): boolean {
  const before = start > 0 ? haystack[start - 1] : "";
  const after = end < haystack.length ? haystack[end] : "";
  return !WORD_CHAR.test(before) && !WORD_CHAR.test(after);
}

/**
 * Finds the phrase in the body a cue points at. Scans every keyword and returns
 * the match that starts earliest; among matches starting at the same spot it
 * prefers the longest (so "login credentials" wins over "credentials"). Short
 * keywords must land on a word boundary to avoid matching inside other words.
 * Returns null if the cue isn't a body cue or nothing matched.
 */
export function findBodyMatch(
  body: string,
  cueId: CueId,
): { start: number; end: number } | null {
  const keywords = BODY_CUE_KEYWORDS[cueId];
  if (!keywords || keywords.length === 0) return null;

  const haystack = body.toLowerCase();
  let best: { start: number; end: number } | null = null;
  for (const kw of keywords) {
    const needle = kw.toLowerCase();
    const idx = haystack.indexOf(needle);
    if (idx === -1) continue;
    const end = idx + needle.length;
    if (!isWordBoundaryMatch(haystack, idx, end)) continue;
    // Earlier start wins; on a tie, the longer phrase wins.
    if (best === null || idx < best.start || (idx === best.start && end > best.end)) {
      best = { start: idx, end };
    }
  }
  return best;
}

/**
 * The highlight treatment for a text span. Uses only a background + rounding so
 * toggling it never changes the box size -- no padding/margin/ring that would
 * reflow (and jitter) the surrounding text. box-decoration-break keeps the
 * highlight looking right when the matched phrase wraps across lines.
 */
export function highlightClass(isActive: boolean): string {
  return isActive
    ? "rounded bg-destructive/20 [box-decoration-break:clone] transition-colors duration-150"
    : "transition-colors duration-150";
}
