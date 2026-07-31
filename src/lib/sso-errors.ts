/**
 * Client-side copy for the ?sso_error=<code> query param the OIDC callback
 * redirects with.
 *
 * The mapping lives here, not on the server, so no IdP-supplied or
 * server-supplied text is ever rendered from the URL -- an unknown code falls
 * back to a generic message rather than echoing whatever was in the query
 * string.
 */
export const SSO_ERROR_MESSAGES: Record<string, string> = {
	// Provisioning rejections -- mirrors SsoRejectCode in src/server/sso/provisioning.ts
	email_unverified: "Your identity provider hasn't verified that email address.",
	domain_not_allowed:
		"That email domain isn't allowed to sign in to this organization.",
	not_a_member:
		"You don't have access to this organization. Ask an admin to invite you.",
	account_disabled:
		"This account has been disabled. Contact your organization administrator.",
	invitation_expired:
		"Your invitation has expired. Ask an admin to send a new one.",
	invitation_revoked:
		"Your invitation was revoked. Contact your organization administrator.",
	seat_limit_reached:
		"This organization has no seats left. Ask an admin to free one up.",

	// Flow failures
	invalid_state:
		"That sign-in link expired or was already used. Please try again.",
	state_expired: "Your sign-in attempt timed out. Please try again.",
	idp_error: "Your identity provider rejected the sign-in.",
	no_email: "Your identity provider didn't share an email address.",
	not_configured: "No single sign-on is configured for that email domain.",
	server_not_configured:
		"Single sign-on isn't available on this server yet. Contact an administrator.",
	rate_limited: "Too many sign-in attempts. Please wait a moment and try again.",
	unexpected:
		"Something went wrong completing sign-in. The server log has the details.",
};

export function ssoErrorMessage(code: string | null | undefined): string {
	if (!code) {
		return "Single sign-on failed. Please try again.";
	}
	return SSO_ERROR_MESSAGES[code] ?? "Single sign-on failed. Please try again.";
}
