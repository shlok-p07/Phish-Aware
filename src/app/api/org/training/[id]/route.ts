import { NextRequest } from "next/server";
import { campaignsCollection, assignmentsCollection, toObjectId } from "@/db";
import { error, requireOrgAdmin, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const DELETE = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const campaignId = toObjectId(id);
    if (!campaignId) {
      return error(400, "Invalid campaign id");
    }

    const campaigns = await campaignsCollection();
    const result = await campaigns.deleteOne({ _id: campaignId, orgId: admin.orgId });
    if (result.deletedCount === 0) {
      return error(404, "Assignment not found");
    }
    const assignments = await assignmentsCollection();
    await assignments.deleteMany({ campaignId });

    return new Response(null, { status: 204 });
  },
);
