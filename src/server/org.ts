import type { ObjectId } from "mongodb";
import {
  organizationsCollection,
  usersCollection,
  invitationsCollection,
  type OrganizationDoc,
} from "@/db";

/**
 * Shared org helpers. toOrgDto used to be copy-pasted into src/app/api/org/
 * route.ts and org/settings/route.ts; adding the SSO fields to only one of
 * them would have made GET and PATCH disagree about the same org.
 */
export function toOrgDto(org: OrganizationDoc) {
  return {
    id: org._id.toString(),
    name: org.name,
    ssoDomain: org.domain ?? "",
    seatLimit: org.settings.seatLimit,
    // Mirrored onto the org whenever a connection is enabled/disabled, so this
    // needs no read of ssoConnections -- and never touches the client secret.
    ssoEnabled: org.ssoProvider !== null,
    ssoProvider: org.ssoProvider,
  };
}

export interface SeatUsage {
  /** Members who occupy a seat: everyone in the org except disabled accounts. */
  activeSeats: number;
  pendingInvitations: number;
  /** 0 means unlimited. */
  seatLimit: number;
}

export async function seatUsage(orgId: ObjectId): Promise<SeatUsage> {
  const [orgs, users, invitations] = await Promise.all([
    organizationsCollection(),
    usersCollection(),
    invitationsCollection(),
  ]);
  const [org, activeSeats, pendingInvitations] = await Promise.all([
    orgs.findOne({ _id: orgId }, { projection: { settings: 1 } }),
    users.countDocuments({ orgId, status: { $ne: "disabled" } }),
    invitations.countDocuments({ orgId, status: "pending" }),
  ]);
  return {
    activeSeats,
    pendingInvitations,
    seatLimit: org?.settings.seatLimit ?? 0,
  };
}

/**
 * Whether one more person can join. Counts pending invitations against the
 * limit at invite time so an admin can't oversubscribe, then counts only real
 * members at accept time so a revoked invitation frees its seat back up.
 */
export function hasSeatAvailable(usage: SeatUsage, countPending: boolean): boolean {
  if (usage.seatLimit <= 0) {
    return true;
  }
  const taken = usage.activeSeats + (countPending ? usage.pendingInvitations : 0);
  return taken < usage.seatLimit;
}
