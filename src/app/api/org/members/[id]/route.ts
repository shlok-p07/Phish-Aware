import { NextRequest } from "next/server";
import { usersCollection, toObjectId, type OrgRole } from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

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
