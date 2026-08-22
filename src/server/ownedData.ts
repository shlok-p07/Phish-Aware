/**
 * Which collections belong to a user, and which to an organisation.
 *
 * Deleting either used to mean remembering, by hand, every collection that holds
 * rows pointing at it. That does not survive the collection list growing:
 * assignments were once left behind by account deletion and had to be added
 * after the fact, and by the time reviews, lessonCompletions and surveyResponses
 * existed, none of them were being removed either -- while the function's own
 * docstring promised "all their data", and the settings page promises the same
 * thing to the person clicking the button. Organisation deletion had the same
 * drift: it cleaned campaigns and assignments but left departments, invitations
 * and, worst of all, the SSO connection.
 *
 * So the lists live here, in one place, and a test asserts that every
 * provisioned collection carrying a userId or orgId appears in one of them or is
 * deliberately named as an exception. Adding a collection then forces the
 * decision rather than silently leaking rows.
 */

/**
 * Collections whose rows die with the user.
 *
 * `sessions` is handled separately -- deleting it is what signs them out, and it
 * has to happen whether or not the account itself is being removed.
 */
export const USER_OWNED_COLLECTIONS = [
  "attempts",
  "assignments",
  "notifications",
  "reviews",
  "lessonCompletions",
  "surveyResponses",
  // A consent record is a statement about a person. Keeping it after they are
  // gone is the opposite of what consent is for.
  "consents",
] as const;

/**
 * Collections whose rows die with the organisation.
 *
 * Members are not in this list: deleting an organisation detaches its people
 * rather than deleting them, so they keep their own accounts and history.
 *
 * `ssoConnections` matters more than it looks. There is a unique index on
 * allowedDomains for enabled connections, so a connection left behind by a
 * deleted organisation claims that email domain permanently -- and the next
 * organisation to try it is told another organisation already has it, with
 * nothing they can do about it.
 */
export const ORG_OWNED_COLLECTIONS = [
  "campaigns",
  "assignments",
  "departments",
  "invitations",
  "ssoConnections",
  "deliveries",
  // The audit trail is scoped to the organisation it describes; there is nobody
  // left to audit once it is gone.
  "auditLogs",
] as const;

/**
 * Provisioned collections that intentionally hold neither a userId nor an orgId
 * owner to cascade from, so the parity test does not expect them in either list.
 */
export const UNOWNED_COLLECTIONS = [
  // The tenants themselves.
  "organizations",
  // Accounts, detached rather than deleted when an org goes.
  "users",
  // Shared authored content: the library belongs to the product, and an
  // org-authored scenario carries orgId but is deliberately kept so historical
  // attempts still resolve to something.
  "lessons",
  "scenarios",
  // Transient auth state, cleaned by TTL and by sign-out.
  "sessions",
  "ssoStates",
] as const;
