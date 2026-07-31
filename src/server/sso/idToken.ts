import { normalizeEmail } from "./domain";

/**
 * Pulling a usable identity out of ID token claims.
 *
 * Signature, iss, aud, exp and nonce are all verified by openid-client before
 * anything here runs -- these claims are already trustworthy. What's left is
 * that IdPs disagree about which of them they actually populate.
 */

export interface IdTokenClaims {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  preferred_username?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  hd?: unknown;
  [key: string]: unknown;
}

export interface SsoIdentity {
  subject: string | null;
  /** Normalized, or null when the token carried no usable address (caller then tries userinfo). */
  email: string | null;
  /** null means the claim was absent, which is different from false. See decideSsoProvisioning. */
  emailVerified: boolean | null;
  name: string | null;
  /** Google Workspace's hosted-domain claim. */
  hostedDomain: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Pick what to show as the person's name.
 *
 * Identity providers frequently set `name` to the email address itself when
 * there's no real profile behind the account -- Auth0 does this for users
 * created by hand. Storing that verbatim makes the members list a column of
 * duplicated addresses, so a name the admin actually typed on the invitation
 * wins over an IdP "name" that's just the address again.
 */
export function displayName(
  idpName: string | null,
  invitedName: string | null,
  email: string,
): string {
  const localPart = email.split("@")[0] || email;
  const idpNameIsJustTheEmail =
    idpName !== null && idpName.trim().toLowerCase() === email.trim().toLowerCase();
  if (idpName && !idpNameIsJustTheEmail) {
    return idpName;
  }
  return invitedName?.trim() || localPart;
}

export function extractIdentity(claims: IdTokenClaims): SsoIdentity {
  const email = asString(claims.email);
  // Okta and Entra often ship the address as preferred_username instead. Only
  // trust it when it actually looks like an address -- elsewhere that claim is
  // a bare login name like "jgreenwald".
  const username = asString(claims.preferred_username);
  const resolvedEmail = email ?? (username?.includes("@") ? username : null);

  let emailVerified: boolean | null = null;
  if (typeof claims.email_verified === "boolean") {
    emailVerified = claims.email_verified;
  } else if (claims.email_verified === "true" || claims.email_verified === "false") {
    // Some IdPs serialize it as a string.
    emailVerified = claims.email_verified === "true";
  }

  const given = asString(claims.given_name);
  const family = asString(claims.family_name);
  const name =
    asString(claims.name) ??
    ([given, family].filter(Boolean).join(" ") || null) ??
    (resolvedEmail ? resolvedEmail.split("@")[0]! : null);

  return {
    subject: asString(claims.sub),
    email: resolvedEmail ? normalizeEmail(resolvedEmail) : null,
    emailVerified,
    name,
    hostedDomain: asString(claims.hd)?.toLowerCase() ?? null,
  };
}
