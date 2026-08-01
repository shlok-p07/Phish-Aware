import { NextRequest } from "next/server";
import { MongoServerError } from "mongodb";
import { invitationsCollection, usersCollection, type UserDoc } from "@/db";
import { hashPassword } from "@/server/password";
import { createSession, getUserIdFromRequest } from "@/server/session";
import { toUserDto } from "@/server/dto";
import { buildUserDoc } from "@/server/users";
import { json, error, withErrorHandling } from "@/server/http";
import { invitationState } from "@/server/invitations";
import { seatUsage, hasSeatAvailable } from "@/server/org";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Accept an invitation. Two modes:
 *
 *   password mode  {name?, password}  -- create a brand-new account
 *   adopt mode     {}  + a session    -- attach the caller's existing account
 *
 * The split exists to stop an invitation from silently swallowing an account
 * its sender doesn't control. If someone already signed up with the invited
 * address, only that person -- authenticated -- can attach it to the org.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ token: string }> }) => {
    const { token } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      password?: string;
    };

    const [invitations, users] = await Promise.all([
      invitationsCollection(),
      usersCollection(),
    ]);

    const invitation = await invitations.findOne({ token });
    if (!invitation) {
      return error(404, "That invitation link isn't valid");
    }
    const state = invitationState(invitation);
    if (state !== "pending") {
      return error(410, `That invitation has been ${state}`);
    }

    // Already in the org -- nothing to do, but don't burn the invitation.
    const alreadyMember = await users.findOne({
      orgId: invitation.orgId,
      email: invitation.email,
    });
    if (alreadyMember) {
      return error(409, "You're already a member of this organization");
    }

    const usage = await seatUsage(invitation.orgId);
    if (!hasSeatAvailable(usage, false)) {
      return error(403, "This organization has no seats left. Ask an admin to free one up.");
    }

    const orphan = await users.findOne({ orgId: null, email: invitation.email });
    const now = new Date();
    let user: UserDoc;

    if (body.password) {
      // An account already holds this address -- refuse to set a new password
      // on it. The holder must sign in and re-POST with an empty body.
      if (orphan) {
        return json(
          {
            error: "An account already uses this email. Sign in to accept the invitation.",
            code: "account_exists",
          },
          { status: 409 },
        );
      }
      if (body.password.length < MIN_PASSWORD_LENGTH) {
        return error(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }

      const created = buildUserDoc({
        name: body.name?.trim() || invitation.name || invitation.email.split("@")[0]!,
        email: invitation.email,
        passwordHash: hashPassword(body.password),
        orgId: invitation.orgId,
        role: invitation.role,
        // Pinned by the admin who sent the invitation, if they set one. The
        // intro survey skips its department question when this is present.
        department: invitation.department,
        status: "active",
        lastLoginAt: now,
        now,
      });
      try {
        await users.insertOne(created);
      } catch (err) {
        if (err instanceof MongoServerError && err.code === 11000) {
          return error(409, "An account with this email already exists.");
        }
        throw err;
      }
      user = created;
    } else {
      // Adopt mode. Requires a session whose email matches the invitation --
      // otherwise anyone holding the link could pull a stranger's account in.
      const callerId = await getUserIdFromRequest();
      if (!callerId) {
        return error(401, "Sign in first, or choose a password to create an account.");
      }
      const caller = await users.findOne({ _id: callerId });
      if (!caller || caller.email !== invitation.email) {
        return error(403, "That invitation was sent to a different email address.");
      }
      if (caller.orgId) {
        return error(409, "You already belong to an organization");
      }

      // Moves the row from the { email } partial unique index into
      // { orgId, email }, so no duplicate-key conflict and no data migration.
      // Keeps their XP, streak, badges, and attempt history.
      const adopted = await users.findOneAndUpdate(
        { _id: callerId, orgId: null },
        {
          $set: {
            orgId: invitation.orgId,
            role: invitation.role,
            status: "active",
            lastLoginAt: now,
            updatedAt: now,
            // Only when the invitation pins one, and only if they haven't
            // already told us themselves on the survey.
            ...(invitation.department && !caller.department
              ? { department: invitation.department }
              : {}),
          },
        },
        { returnDocument: "after" },
      );
      if (!adopted) {
        return error(409, "You already belong to an organization");
      }
      user = adopted;
    }

    // Conditional on status:"pending" so a double-submit can't produce two
    // users off one invitation -- the second update matches nothing.
    const claimed = await invitations.findOneAndUpdate(
      { _id: invitation._id, status: "pending" },
      {
        $set: {
          status: "accepted",
          acceptedAt: now,
          acceptedUserId: user._id,
          updatedAt: now,
        },
      },
    );
    if (!claimed) {
      return error(410, "That invitation has already been accepted");
    }

    await createSession(user._id);

    return json(toUserDto(user), { status: 201 });
  },
);
