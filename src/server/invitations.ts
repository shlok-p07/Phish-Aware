import { randomBytes } from "node:crypto";
import type { InvitationStatus } from "@/db/models/invitations";

/** How long a fresh invitation stays usable. */
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * 32 random bytes, base64url so it survives a URL path segment untouched. This
 * is a bearer credential -- holding it is enough to join the org -- so it gets
 * the same entropy as a session token.
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_MS);
}

/**
 * The effective status, which is not always the stored one: "pending" past its
 * expiry reads as "expired" without anything having written to the row.
 *
 * Expiry is computed rather than swept because expired invitations have to stay
 * queryable for the audit trail -- hence no TTL index on invitations.expiresAt.
 */
export function invitationState(
  invitation: { status: InvitationStatus; expiresAt: Date | null },
  now: Date = new Date(),
): InvitationStatus {
  if (invitation.status !== "pending") {
    return invitation.status;
  }
  if (invitation.expiresAt !== null && invitation.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "pending";
}

export function isInvitationUsable(
  invitation: { status: InvitationStatus; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return invitationState(invitation, now) === "pending";
}
