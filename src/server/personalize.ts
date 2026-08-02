/**
 * Scenarios address the trainee by name, but the scenario pool is shared: a
 * scenario generated while one person was practicing gets served to everyone
 * else (see the pool query in the practice/next route). So the trainee's real
 * name must never be baked into a stored scenario -- that would both show the
 * wrong name to every subsequent reader and leak a real person's name across
 * accounts.
 *
 * Instead, generated scenarios carry a NAME_TOKEN placeholder, and the name is
 * substituted at serve time for whoever is actually logged in.
 */

export const NAME_TOKEN = "{{firstName}}";

// Placeholder forms we accept on the way in. The canonical token is the first
// one; the rest are the shapes an LLM reaches for when it decides to leave a
// blank for the recipient -- "Hey [Trainee's First Name]" and friends. Matching
// them means a model that ignores the token instruction still ends up
// personalized rather than shipping raw brackets to the learner.
const PLACEHOLDER_PATTERNS: RegExp[] = [
  // {{firstName}}, {{ name }}, {first_name}
  /\{\{?\s*(?:first[\s_-]*name|full[\s_-]*name|name|firstname)\s*\}?\}/gi,
  // <name>, <First Name>
  /<\s*(?:first[\s_-]*name|name)\s*>/gi,
  // [Trainee's First Name], [Employee Name], [Name], [Recipient's name]
  /\[[^\]\n]{0,40}\bnames?\b[^\]\n]{0,20}\]/gi,
  // [Trainee], [Employee], [Recipient], [Customer] -- same blank, no "name" word
  /\[\s*(?:the\s+)?(?:trainee|employee|recipient|user|customer|target|colleague)(?:'s)?\s*\]/gi,
];

/**
 * What to call someone when we have no name on file. Deliberately a real
 * greeting rather than an empty string, so "Hey {{firstName}}," degrades to
 * "Hey there," instead of the tell-tale "Hey ,".
 */
const FALLBACK_NAME = "there";

/**
 * The name a message would actually open with. People are addressed by first
 * name in a greeting, so "Taylor Morgan" -> "Taylor"; an address-shaped name
 * falls back to its local part rather than rendering the whole mailbox.
 */
export function firstNameOf(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (trimmed.length === 0) return null;

  const local = trimmed.includes("@") ? (trimmed.split("@")[0] ?? "") : trimmed;
  // Split on whitespace, but also on the separators that show up in
  // address-derived names ("taylor.morgan", "taylor_morgan").
  const first = local.split(/[\s._-]+/).filter(Boolean)[0];
  return first && first.length > 0 ? first : null;
}

/** Replaces every recipient placeholder in `text` with `name`. */
export function personalizeText(text: string, name: string | null | undefined): string {
  if (typeof text !== "string" || text.length === 0) return text;
  const replacement = firstNameOf(name) ?? FALLBACK_NAME;
  return PLACEHOLDER_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, replacement),
    text,
  );
}

/** Rewrites any placeholder form into the canonical token, for storage. */
export function normalizePlaceholders(text: string): string {
  if (typeof text !== "string" || text.length === 0) return text;
  return PLACEHOLDER_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, NAME_TOKEN),
    text,
  );
}

export function hasPlaceholder(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  // .test() with a /g regex advances lastIndex between calls, so ask a fresh
  // copy each time rather than leaking state across invocations.
  return PLACEHOLDER_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(text));
}

interface PersonalizableScenario {
  sender: string;
  subject: string;
  body: string;
}

/**
 * Renders a stored scenario for one specific reader. Applied at serve time, so
 * the same shared scenario greets each trainee by their own name.
 */
export function personalizeScenario<T extends PersonalizableScenario>(
  scenario: T,
  name: string | null | undefined,
): T {
  return {
    ...scenario,
    sender: personalizeText(scenario.sender, name),
    subject: personalizeText(scenario.subject, name),
    body: personalizeText(scenario.body, name),
  };
}
