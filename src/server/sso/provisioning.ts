import type { OrgRole, UserStatus } from "@/db";
import type { InvitationStatus } from "@/db/models/invitations";
import { domainAllowed } from "./domain";

/**
 * Who is allowed in through an org's IdP, and what happens to them.
 *
 * Deliberately pure: the callback gathers the inputs, calls this, and applies
 * the outcome. Every rejection path is therefore unit-testable without a
 * database, which matters because this is the only thing standing between a
 * stranger with a valid Google account and someone else's organization.
 */

export interface SsoProvisionInput {
  /** Already normalized by normalizeEmail. */
  email: string;
  /** null means the ID token omitted the claim -- not the same as false. */
  emailVerified: boolean | null;
  requireVerifiedEmail: boolean;
  /** Empty means no domain restriction. */
  allowedDomains: string[];
  /** The users row matching { orgId, email }, if any. */
  member: { id: string; status: UserStatus } | null;
  /**
   * A users row matching { orgId: null, email } -- someone who signed up
   * directly before being invited. The split partial unique indexes on `users`
   * allow this to coexist with an org-scoped row of the same address.
   */
  orphan: { id: string } | null;
  invitation: {
    id: string;
    role: OrgRole;
    status: InvitationStatus;
    expiresAt: Date | null;
  } | null;
  activeSeats: number;
  /** 0 means unlimited. */
  seatLimit: number;
  now: Date;
}

export type SsoRejectCode =
  | "email_unverified"
  | "domain_not_allowed"
  | "not_a_member"
  | "account_disabled"
  | "invitation_expired"
  | "invitation_revoked"
  | "seat_limit_reached";

export type SsoProvisionDecision =
  | { kind: "login"; userId: string }
  | { kind: "adopt"; userId: string; role: OrgRole; invitationId: string }
  | { kind: "create"; role: OrgRole; invitationId: string }
  | { kind: "reject"; code: SsoRejectCode };

export function decideSsoProvisioning(input: SsoProvisionInput): SsoProvisionDecision {
  const {
    email,
    emailVerified,
    requireVerifiedEmail,
    allowedDomains,
    member,
    orphan,
    invitation,
    activeSeats,
    seatLimit,
    now,
  } = input;

  if (!domainAllowed(email, allowedDomains)) {
    return { kind: "reject", code: "domain_not_allowed" };
  }

  if (requireVerifiedEmail) {
    if (emailVerified === false) {
      return { kind: "reject", code: "email_unverified" };
    }
    // An ABSENT claim is treated as verified only when the address falls inside
    // a domain the admin explicitly allowed for this connection.
    //
    // Microsoft Entra ID never emits email_verified. Reading "absent" as
    // "unverified" would make Entra -- one of the three providers this feature
    // exists for -- permanently unusable. The admin having bound that domain to
    // that specific tenant issuer is the domain-control assertion standing in
    // for the claim. With no domain restriction there is no such assertion, so
    // an absent claim is rejected.
    if (emailVerified === null && allowedDomains.length === 0) {
      return { kind: "reject", code: "email_unverified" };
    }
  }

  if (member) {
    if (member.status === "disabled") {
      return { kind: "reject", code: "account_disabled" };
    }
    return { kind: "login", userId: member.id };
  }

  if (invitation) {
    if (invitation.status === "revoked") {
      return { kind: "reject", code: "invitation_revoked" };
    }
    // Accepted, but no member row -- they were removed from the org afterwards.
    // A spent invitation must not let them back in.
    if (invitation.status === "accepted") {
      return { kind: "reject", code: "not_a_member" };
    }
    if (invitation.status === "expired") {
      return { kind: "reject", code: "invitation_expired" };
    }
    if (invitation.expiresAt !== null && invitation.expiresAt.getTime() <= now.getTime()) {
      return { kind: "reject", code: "invitation_expired" };
    }
    if (seatLimit > 0 && activeSeats >= seatLimit) {
      return { kind: "reject", code: "seat_limit_reached" };
    }
    if (orphan) {
      return {
        kind: "adopt",
        userId: orphan.id,
        role: invitation.role,
        invitationId: invitation.id,
      };
    }
    return { kind: "create", role: invitation.role, invitationId: invitation.id };
  }

  return { kind: "reject", code: "not_a_member" };
}

/** User-facing copy for each rejection, shown via /auth?sso_error=<code>. */
export const SSO_REJECT_MESSAGES: Record<SsoRejectCode, string> = {
  email_unverified: "Your identity provider hasn't verified that email address.",
  domain_not_allowed: "That email domain isn't allowed to sign in to this organization.",
  not_a_member: "You don't have access to this organization. Ask an admin to invite you.",
  account_disabled: "This account has been disabled. Contact your organization administrator.",
  invitation_expired: "Your invitation has expired. Ask an admin to send a new one.",
  invitation_revoked: "Your invitation was revoked. Contact your organization administrator.",
  seat_limit_reached: "This organization has no seats left. Ask an admin to free one up.",
};
