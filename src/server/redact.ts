/**
 * Redaction helpers for anything that reaches a log.
 *
 * Logs leave the process. They are shipped to aggregators, retained on someone
 * else's schedule and read by people who have no business knowing who signed
 * in. An email address in a log line is personal data in a system we do not
 * control, so it never goes in whole.
 *
 * The domain is kept deliberately: single sign-on failures are almost always
 * domain-allowlist problems, and a log that cannot tell you the domain cannot
 * help you fix one. The local part carries the identity, so that is what goes.
 */

/** `alice.smith@acme.test` becomes `a***@acme.test`. Not reversible. */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return "[redacted]";
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "[redacted]";
  const domain = email.slice(at + 1);
  return `${email[0]}***@${domain}`;
}

/**
 * Shortens a Mongo ObjectId for correlating log lines without reproducing the
 * full identifier. Twelve hex characters is ample to follow one request through
 * a log file and useless as a lookup key on its own.
 */
export function shortId(id: { toString(): string } | null | undefined): string {
  if (!id) return "[none]";
  const s = id.toString();
  return s.length <= 12 ? s : s.slice(0, 12);
}
