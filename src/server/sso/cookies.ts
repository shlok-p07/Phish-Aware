import { SSO_STATE_TTL_MS } from "@/db";

/**
 * Companion to the ssoStates row: carries only the `state` value, so the
 * callback can prove the flow was started by this same browser.
 *
 * The DB row is what makes state single-use; this cookie is what stops login
 * CSRF, where an attacker completes a flow against their own IdP account and
 * feeds the resulting ?code=&state= URL to a victim.
 */
export const SSO_STATE_COOKIE = "phishaware_sso_state";

export function ssoStateCookieOptions() {
  return {
    httpOnly: true,
    // Must be "lax", never "strict": the callback is a top-level cross-site
    // navigation back from the IdP, and "strict" would drop the cookie.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/sso",
    maxAge: Math.floor(SSO_STATE_TTL_MS / 1000),
  };
}
