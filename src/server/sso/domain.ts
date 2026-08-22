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

/**
 * The domain an admin meant, from whatever they typed.
 *
 * Every place a domain is configured accepted the raw string, and there is hard
 * evidence that is not good enough: three organisations have a full email
 * address sitting in their SSO domain field, and one has "@northeastern.edu"
 * with the leading sign. A domain list is matched exactly against an email's
 * domain, so any of those silently matches nothing -- SSO simply never appears,
 * with no error anywhere to explain why.
 *
 * So the three things a person actually types are all accepted and reduced to
 * the same value:
 *
 *   example.com          -> example.com
 *   @example.com         -> example.com
 *   someone@example.com  -> example.com
 *
 * Anything that is not domain-shaped returns null, so the caller can reject it
 * rather than store something unmatchable.
 */
export function parseDomainInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;

  // A pasted URL is a reasonable thing to type into a field labelled "domain".
  value = value.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "");
  // Take the domain half of an address, and drop a bare leading sign.
  const at = value.lastIndexOf("@");
  if (at !== -1) value = value.slice(at + 1);

  if (!value.includes(".") || /\s/.test(value)) return null;
  // Labels of letters, digits and hyphens, not starting or ending with one, and
  // a final label that is alphabetic -- which excludes an IP address.
  if (!/^(?!-)[a-z0-9-]+(?<!-)(\.(?!-)[a-z0-9-]+(?<!-))*\.[a-z]{2,}$/.test(value)) {
    return null;
  }
  return value;
}
