import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { usersCollection, assignmentsCollection, toObjectId, type OrgRole } from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling, readJsonBody } from "@/server/http";
import { recordAudit } from "@/server/audit";
import { findOrgDepartment } from "@/server/departments";

export const dynamic = "force-dynamic";

/**
 * True if `memberId` is currently this org's only admin -- used to block
 * demoting/removing/orphaning the last admin, which would otherwise lock the
 * whole org out of its own admin panel with no way back in (nobody left who
 * can re-promote anyone).
 */
async function isSoleOrgAdmin(
  orgId: ObjectId,
  memberId: ObjectId,
): Promise<boolean> {
  const users = await usersCollection();
  const member = await users.findOne({ _id: memberId, orgId });
  if (!member || member.role !== "admin") {
    return false;
  }
  const otherAdmins = await users.countDocuments({
    orgId,
    role: "admin",
    _id: { $ne: memberId },
  });
  return otherAdmins === 0;
}

export const PATCH = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const memberId = toObjectId(id);
    if (!memberId) {
      return error(400, "Invalid member id");
    }
    const body = (await readJsonBody(req)) as {
      role?: OrgRole;
      department?: string | null;
    };

    // Both fields are optional: an admin may be changing either one. Building the
    // update from what was actually sent keeps a role change from wiping a
    // department, and vice versa.
    const update: Record<string, unknown> = {};

    if (body.role !== undefined) {
      update.role = body.role === "admin" ? "admin" : "employee";
    }

    if (body.department !== undefined) {
      // Same rule as inviting a member: anything outside the survey's enum is
      // rejected rather than stored, because an unrecognized department silently
      // breaks the department -> attack-type mapping and would leave the member
      // in a leaderboard population of one.
if (body.department === null) {
        update.department = null;
        update.departmentId = null;
      } else {
        const match = await findOrgDepartment(admin.orgId, String(body.department));
        if (!match) {
          return error(400, "That isn't a department in your organization");
        }
        update.department = match.name;
        update.departmentId = match._id;
      }
    }

    if (Object.keys(update).length === 0) {
      return error(400, "Nothing to update");
    }

    const users = await usersCollection();

    if (
      update.role === "employee" &&
      (await isSoleOrgAdmin(admin.orgId, memberId))
    ) {
      return error(
        409,
        "Can't remove the organization's only admin. Promote someone else first.",
      );
    }

    const member = await users.findOneAndUpdate(
      { _id: memberId, orgId: admin.orgId },
      { $set: update },
      { returnDocument: "after" },
    );
    if (!member) {
      return error(404, "Member not found");
    }
    // After the write, so the trail never claims something that did not happen.
    if (body.role !== undefined) {
      await recordAudit({
        orgId: admin.orgId,
        actorId: admin._id,
        action: "member.role_changed",
        targetType: "user",
        targetId: memberId,
        metadata: { role: update.role },
        headers: req.headers,
      });
    }
    if (body.department !== undefined) {
      await recordAudit({
        orgId: admin.orgId,
        actorId: admin._id,
        action: "member.department_changed",
        targetType: "user",
        targetId: memberId,
        metadata: { department: update.department },
        headers: req.headers,
      });
    }

    return json({
      id: member._id.toString(),
      role: member.role,
      department: member.department ?? null,
    });
  },
);

export const DELETE = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const memberId = toObjectId(id);
    if (!memberId) {
      return error(400, "Invalid member id");
    }

    const users = await usersCollection();

    if (await isSoleOrgAdmin(admin.orgId, memberId)) {
      return error(
        409,
        "Can't remove the organization's only admin. Promote someone else first.",
      );
    }

    // Orphan the member rather than deleting their account outright -- keeps
    // their attempt history intact for continuity, just outside the org.
    const result = await users.updateOne(
      { _id: memberId, orgId: admin.orgId },
      { $set: { orgId: null, role: "employee", department: null, departmentId: null } },
    );
    if (result.matchedCount === 0) {
      return error(404, "Member not found");
    }

    // A training assignment is an obligation to this organization, so it does
    // not survive leaving it. Left behind, these rows accumulated as orphans
    // pointing at somebody who is no longer a member, kept counting toward the
    // org's assignment totals, and -- until the read was scoped -- showed the
    // former member their old employer's mandatory training.
    await (await assignmentsCollection()).deleteMany({
      userId: memberId,
      orgId: admin.orgId,
    });

    await recordAudit({
      orgId: admin.orgId,
      actorId: admin._id,
      action: "member.removed",
      targetType: "user",
      targetId: memberId,
      headers: _req.headers,
    });

    return new Response(null, { status: 204 });
  },
);
