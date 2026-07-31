/**
 * Email normalization and domain matching.
 *
 * IdPs return lowercase addresses, so everything that touches an email on the
 * SSO path -- lookups, invitation matching, new user rows -- goes through
 * normalizeEmail first. Signup and login do the same, so the two paths can't
 * produce two accounts that differ only in case.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The bare domain of an address, or null when it isn't shaped like one. */
export function emailDomain(email: string): string | null {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) {
    return null;
  }
  const domain = normalized.slice(at + 1);
  // No dot means it isn't a routable domain; a space means it isn't an address.
  if (!domain.includes(".") || /\s/.test(domain)) {
    return null;
  }
  return domain;
}

/**
 * Exact match only -- subdomains do not inherit. An admin who allows "acme.com"
 * has not vouched for whoever controls "mail.acme.com".
 *
 * An empty list means "no domain restriction". That is only reachable when an
 * admin deliberately clears the field; the SSO settings form requires at least
 * one domain to enable a connection.
 */
export function domainAllowed(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) {
    return true;
  }
  const domain = emailDomain(email);
  if (domain === null) {
    return false;
  }
  return allowedDomains.some((d) => d.trim().toLowerCase() === domain);
}
