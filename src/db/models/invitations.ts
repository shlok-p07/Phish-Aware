import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";
import type { OrgRole } from "./users";

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

/**
 * A pending offer of org membership. Replaces the old approach of inserting a
 * `status: "invited"` users row up front, which produced an account nobody
 * could ever sign in to (null passwordHash blocks login; the duplicate email
 * blocks signup).
 *
 * `status` is the stored value; the effective one is computed by
 * invitationState() in src/server/invitations.ts, since a pending row past its
 * expiry reads as expired without anything having written to it.
 */
export interface InvitationDoc extends SpecConventions {
  _id: ObjectId;
  invitationId: ObjectId; // named PK per the shared spec -- mirrors _id
  orgId: ObjectId;
  email: string; // normalized (trimmed + lowercased)
  // App extra, not in the shared spec's validator -- prefills the accept page.
  name: string | null;
  role: OrgRole;
  departmentId: ObjectId | null;
  // App extra: a department label from the survey's DEPARTMENTS enum, pinned
  // by the inviting admin. Copied onto the user on accept, which is what lets
  // the intro survey skip the question. Distinct from departmentId above,
  // which is the org's formal department-directory FK.
  department: string | null;
  /** Bearer credential: 32 random bytes, base64url. Unique-indexed. */
  token: string;
  status: InvitationStatus;
  invitedBy: ObjectId;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  // App extra -- which user row ended up satisfying this invitation.
  acceptedUserId: ObjectId | null;
}

export type InsertInvitation = Omit<InvitationDoc, "_id">;

export const INVITATIONS_COLLECTION = "invitations";

export function invitationsCollection() {
  return getCollection<InvitationDoc>(INVITATIONS_COLLECTION);
}
