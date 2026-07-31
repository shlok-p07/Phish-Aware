/**
 * The app's public origin, with no trailing slash.
 *
 * APP_BASE_URL is a server-only override for deployments sitting behind a proxy
 * whose public origin differs from the build-time NEXT_PUBLIC_SITE_URL. It has
 * to be exact: it builds the OIDC redirect_uri, which the IdP matches as a
 * literal string.
 */
export function siteUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/**
 * One callback for every org -- the org is resolved from `state`, never from
 * the URL. Adding a query param here would break the IdP's exact-match on
 * redirect_uri, which OAuth 2.1 mandates.
 */
export function ssoRedirectUri(): string {
  return `${siteUrl()}/api/auth/sso/callback`;
}

export function inviteUrl(token: string): string {
  return `${siteUrl()}/invite/${token}`;
}
