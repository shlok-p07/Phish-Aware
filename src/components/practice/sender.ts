/**
 * Display parsing for a scenario's `sender` field, which may arrive as
 * `Name <address>`, a bare address, or a plain name / phone number.
 *
 * Pure and separate from the practice page so it can be tested directly --
 * the address-shaped cases are exactly the sort of thing that regresses
 * silently inside a 900-line component.
 */
export interface ParsedSender {
  name: string;
  /** Empty when the sender carries no address (e.g. a phone number). */
  email: string;
}

const NAME_AND_ADDRESS = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/;

export function parseSender(raw: string): ParsedSender {
  const match = raw.match(NAME_AND_ADDRESS);
  if (match && match[2]) {
    const email = match[2].trim();
    // An empty display name falls back to the address rather than rendering blank.
    return { name: match[1].trim() || email, email };
  }
  if (raw.includes("@")) {
    const trimmed = raw.trim();
    return { name: trimmed, email: trimmed };
  }
  return { name: raw.trim(), email: "" };
}

/**
 * A sender that reads as a phone number or short code gets a phone glyph
 * rather than an initial -- an initial taken from "+1 (302)..." is just "+".
 */
export function isNumericSender(name: string): boolean {
  return /^[+\d]/.test(name.trim());
}
