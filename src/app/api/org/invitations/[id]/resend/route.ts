import { NextRequest } from "next/server";
import { invitationsCollection, toObjectId } from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";
import { generateInviteToken, invitationExpiry, invitationState } from "@/server/invitations";
import { inviteUrl } from "@/server/siteUrl";

export const dynamic = "force-dynamic";

/**
 * Rotate the token and push the expiry out.
 *
 * Deliberately destructive to the old link: this is the "I think that link
 * leaked" action, so reissuing has to invalidate what leaked. Callers who just
 * want the current link should use /link instead.
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
    const existing = await invitations.findOne({ _id: invitationId, orgId: admin.orgId });
    if (!existing) {
      return error(404, "Invitation not found");
    }
    if (invitationState(existing) !== "pending") {
      return error(410, "That invitation is no longer pending");
    }

    const now = new Date();
    const token = generateInviteToken();
    const expiresAt = invitationExpiry(now);
    await invitations.updateOne(
      { _id: invitationId, orgId: admin.orgId },
      { $set: { token, expiresAt, updatedAt: now } },
    );

    return json({ url: inviteUrl(token), expiresAt: expiresAt.toISOString() });
  },
);
