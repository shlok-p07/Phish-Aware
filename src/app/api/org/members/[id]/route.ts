import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { usersCollection, toObjectId, type OrgRole } from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * True if `memberId` is currently this org's only admin -- used to block
 * demoting/removing/orphaning the last admin, which would otherwise lock the
 * whole org out of its own admin panel with no way back in (nobody left who
 * can re-promote anyone).
 */
async function isSoleOrgAdmin(orgId: ObjectId, memberId: ObjectId): Promise<boolean> {
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
    const body = (await req.json()) as { role: OrgRole };
    const role: OrgRole = body.role === "admin" ? "admin" : "employee";

    const users = await usersCollection();

    if (role !== "admin" && (await isSoleOrgAdmin(admin.orgId, memberId))) {
      return error(409, "Can't remove the organization's only admin. Promote someone else first.");
    }

    const member = await users.findOneAndUpdate(
      { _id: memberId, orgId: admin.orgId },
      { $set: { role } },
      { returnDocument: "after" },
    );
    if (!member) {
      return error(404, "Member not found");
    }
    return json({ id: member._id.toString(), role: member.role });
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
      return error(409, "Can't remove the organization's only admin. Promote someone else first.");
    }

    // Orphan the member rather than deleting their account outright -- keeps
    // their attempt history intact for continuity, just outside the org.
    const result = await users.updateOne(
      { _id: memberId, orgId: admin.orgId },
      { $set: { orgId: null, role: "employee" } },
    );
    if (result.matchedCount === 0) {
      return error(404, "Member not found");
    }
    return new Response(null, { status: 204 });
  },
);
