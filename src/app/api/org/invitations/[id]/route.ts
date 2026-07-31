import { NextRequest } from "next/server";
import { invitationsCollection, toObjectId } from "@/db";
import { error, requireOrgAdmin, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

/** Revoke a pending invitation. The row is kept, for the audit trail. */
export const DELETE = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const invitationId = toObjectId(id);
    if (!invitationId) {
      return error(400, "Invalid invitation id");
    }

    const invitations = await invitationsCollection();
    const result = await invitations.updateOne(
      { _id: invitationId, orgId: admin.orgId, status: "pending" },
      { $set: { status: "revoked", updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return error(404, "Invitation not found");
    }
    return new Response(null, { status: 204 });
  },
);
