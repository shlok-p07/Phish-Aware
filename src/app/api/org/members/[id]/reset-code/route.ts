import { NextRequest } from "next/server";
import { usersCollection, toObjectId } from "@/db";
import { hashPassword, generateResetCode } from "@/server/password";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";
import { recordAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

const CODE_VALID_MS = 15 * 60 * 1000;

/**
 * Issues a one-time reset code for a member of the caller's own organization.
 *
 * This is the path that works in production, where the self-service route
 * deliberately returns nothing: with no mail delivery, handing a code to an
 * unauthenticated caller would let anyone who knows an address take over the
 * account. An admin is already trusted with their own organization's members, so
 * routing the code through them and out of band -- a phone call, a desk visit --
 * keeps the capability without putting it on the public internet.
 *
 * The code is redeemed through the ordinary confirm route; nothing about
 * redemption is special-cased for admin-issued codes.
 */
export const POST = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const memberId = toObjectId(id);
    if (!memberId) {
      return error(400, "Invalid member id");
    }

    const users = await usersCollection();
    const member = await users.findOne({ _id: memberId, orgId: admin.orgId });
    if (!member) {
      return error(404, "Member not found");
    }
    // An SSO-only account has no password, so a reset code would be redeemable
    // against nothing -- and the confirm route only matches accounts that have
    // one. Saying so is more useful than issuing a code that cannot work.
    if (!member.passwordHash) {
      return error(409, "That member signs in with SSO and has no password to reset");
    }

    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + CODE_VALID_MS);
    await users.updateOne(
      { _id: member._id },
      {
        $set: {
          passwordResetCodeHash: hashPassword(code),
          passwordResetExpiresAt: expiresAt,
          updatedAt: new Date(),
        },
      },
    );

    // Records that a code was issued, never the code itself: the entry exists so
    // an organization can see who handed out the ability to sign in as somebody
    // else, and writing the secret into a log would defeat the point.
    await recordAudit({
      orgId: admin.orgId,
      actorId: admin._id,
      action: "member.reset_code_issued",
      targetType: "user",
      targetId: member._id,
      metadata: { expiresAt: expiresAt.toISOString() },
      headers: _req.headers,
    });

    return json({ code, expiresAt: expiresAt.toISOString() }, { status: 201 });
  },
);
