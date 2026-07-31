import { NextRequest } from "next/server";
import { invitationsCollection, toObjectId } from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";
import { invitationState } from "@/server/invitations";
import { inviteUrl } from "@/server/siteUrl";

export const dynamic = "force-dynamic";

/**
 * Hand the existing accept link back to the admin.
 *
 * POST rather than GET so react-query never caches a bearer token, and so the
 * link isn't fetched incidentally when the members page renders. The token is
 * unchanged -- /resend is the one that rotates it.
 */
export const POST = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const invitationId = toObjectId(id);
    if (!invitationId) {
      return error(400, "Invalid invitation id");
    }

    const invitations = await invitationsCollection();
    const invitation = await invitations.findOne({
      _id: invitationId,
      orgId: admin.orgId,
    });
    if (!invitation) {
      return error(404, "Invitation not found");
    }
    if (invitationState(invitation) !== "pending") {
      return error(410, "That invitation is no longer pending");
    }

    return json({
      url: inviteUrl(invitation.token),
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
    });
  },
);
