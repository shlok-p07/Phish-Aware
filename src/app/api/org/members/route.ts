import { NextRequest } from "next/server";
import { ObjectId, MongoServerError } from "mongodb";
import {
  usersCollection,
  invitationsCollection,
  specDefaults,
  type OrgRole,
  type InvitationDoc,
  type UserDoc,
} from "@/db";
import { computeMemberStats, riskLevelForAccuracy } from "@/server/orgAnalytics";
import { json, error, requireOrgAdmin, withErrorHandling, readJsonBody } from "@/server/http";
import { recordAudit } from "@/server/audit";
import { normalizeEmail } from "@/server/sso/domain";
import { generateInviteToken, invitationExpiry, invitationState } from "@/server/invitations";
import { inviteUrl } from "@/server/siteUrl";
import { seatUsage, hasSeatAvailable } from "@/server/org";
import { findOrgDepartment } from "@/server/departments";

export const dynamic = "force-dynamic";

function memberRow(member: UserDoc, accuracy: number) {
  return {
    id: member._id.toString(),
    kind: "member" as const,
    name: member.name,
    email: member.email,
    role: member.role,
    department: member.department,
    status: member.status,
    joinedAt: member.status === "active" ? member.createdAt.toISOString() : null,
    expiresAt: null,
    accuracy,
    riskLevel: riskLevelForAccuracy(accuracy, 0),
  };
}

function invitationRow(invitation: InvitationDoc) {
  return {
    id: invitation._id.toString(),
    kind: "invitation" as const,
    name: invitation.name ?? invitation.email.split("@")[0]!,
    email: invitation.email,
    role: invitation.role,
    department: invitation.department,
    status: "invited" as const,
    joinedAt: null,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    accuracy: 0,
    riskLevel: "high" as const,
  };
}

/**
 * Members plus outstanding invitations, merged. Invitations have to appear
 * here or inviting someone would look like it did nothing -- they no longer
 * have a users row to show up as.
 */
export const GET = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const [users, invitations] = await Promise.all([
    usersCollection(),
    invitationsCollection(),
  ]);

  const members = await users.find({ orgId: admin.orgId }).toArray();
  const stats = await computeMemberStats(members.map((m) => m._id));

  const pending = (
    await invitations.find({ orgId: admin.orgId, status: "pending" }).toArray()
  ).filter((invitation) => invitationState(invitation) === "pending");

  return json([
    ...members.map((member) => {
      const s = stats.get(member._id.toString())!;
      return {
        ...memberRow(member, s.accuracy),
        riskLevel: riskLevelForAccuracy(s.accuracy, s.totalAttempts),
      };
    }),
    ...pending.map(invitationRow),
  ]);
});

/**
 * Invite a member: creates a pending invitation, NOT a user account.
 *
 * The old behavior inserted a users row with passwordHash:null and
 * status:"invited", which produced an account nobody could ever sign in to --
 * login rejects a null hash, and signup 409s on the duplicate email.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  const body = (await readJsonBody(req)) as {
    name?: string;
    email?: string;
    role?: OrgRole;
    department?: string;
  };

  const rawEmail = body.email?.trim();
  if (!rawEmail) {
    return error(400, "Email is required");
  }
  const email = normalizeEmail(rawEmail);
  if (!email.includes("@")) {
    return error(400, "Enter a valid email address");
  }
  const name = body.name?.trim() || null;
  const role: OrgRole = body.role === "admin" ? "admin" : "employee";
  // Optional, and checked against this organization's own departments rather
  // than a fixed list -- the fixed list is what previously made a customer's own
  // department names unusable. An unrecognised name is rejected rather than
  // stored, since a department nobody has defined would put the member in a
  // reporting group of one.
  let department: string | null = null;
  if (body.department !== undefined && body.department !== "" && body.department !== null) {
    const match = await findOrgDepartment(admin.orgId, String(body.department));
    if (!match) {
      return error(400, "That isn't a department in your organization");
    }
    department = match.name;
  }

  const [users, invitations] = await Promise.all([
    usersCollection(),
    invitationsCollection(),
  ]);

  const existing = await users.findOne({ orgId: admin.orgId, email });
  if (existing) {
    return error(409, "That person is already a member of this organization");
  }

  const usage = await seatUsage(admin.orgId);
  if (!hasSeatAvailable(usage, true)) {
    return error(
      403,
      "Seat limit reached. Remove a member or raise the limit in Organization settings.",
    );
  }

  const now = new Date();
  const id = new ObjectId();
  const invitation: InvitationDoc = {
    _id: id,
    invitationId: id,
    orgId: admin.orgId,
    email,
    name,
    role,
    departmentId: null,
    department,
    token: generateInviteToken(),
    status: "pending",
    invitedBy: admin._id,
    expiresAt: invitationExpiry(now),
    acceptedAt: null,
    acceptedUserId: null,
    ...specDefaults(now),
  };

  try {
    await invitations.insertOne(invitation);
  } catch (err) {
    // Backed by the { orgId, email } unique partial index on status:"pending",
    // so a concurrent double-invite lands here rather than creating two rows.
    if (err instanceof MongoServerError && err.code === 11000) {
      return error(409, "That person already has a pending invitation");
    }
    throw err;
  }

  // The only place the link is handed out on creation. The members list
  // deliberately omits it rather than caching bearer tokens in the browser.
  await recordAudit({
    orgId: admin.orgId,
    actorId: admin._id,
    action: "member.invited",
    targetType: "invitation",
    targetId: id,
    metadata: { role, department },
    headers: req.headers,
  });

  return json(
    { member: invitationRow(invitation), inviteUrl: inviteUrl(invitation.token) },
    { status: 201 },
  );
});
