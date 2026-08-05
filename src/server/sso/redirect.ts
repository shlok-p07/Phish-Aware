/**
 * Where to send the user after a successful SSO login. The value arrives as a
 * query param on /api/auth/sso/start, so it is fully attacker-controlled and
 * has to be reduced to a same-origin path before we ever redirect to it.
 */

const DEFAULT_REDIRECT = "/dashboard";

/** Control chars (incl. newline/tab) -- browsers may strip these, turning a rejected string into an accepted one. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Accepts only a same-origin absolute path. Anything else -- a scheme, a
 * protocol-relative "//host", a backslash variant browsers normalize into one,
 * or an embedded control character -- falls back.
 */
export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!candidate) {
    return fallback;
  }
  // Browsers treat backslashes as slashes in some positions, so "/\evil.com"
  // and "\/evil.com" are protocol-relative URLs in disguise.
  if (candidate.includes("\\")) {
    return fallback;
  }
  if (CONTROL_CHARS.test(candidate)) {
    return fallback;
  }
  if (!candidate.startsWith("/")) {
    return fallback;
  }
  if (candidate.startsWith("//")) {
    return fallback;
  }
  return candidate;
}
