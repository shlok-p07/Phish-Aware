import { NextRequest } from "next/server";
import { MongoServerError } from "mongodb";
import {
  invitationsCollection,
  usersCollection,
  organizationsCollection,
  getMongoClient,
  type UserDoc,
} from "@/db";
import { hashPassword } from "@/server/password";
import { createSession, getUserIdFromRequest } from "@/server/session";
import { toUserDto } from "@/server/dto";
import { buildUserDoc } from "@/server/users";
import { json, error, HttpError, withErrorHandling } from "@/server/http";
import { invitationState } from "@/server/invitations";
import { hasSeatAvailable } from "@/server/org";

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

    const invitations = await invitationsCollection();
    const invitation = await invitations.findOne({ token });
    if (!invitation) {
      return error(404, "That invitation link isn't valid");
    }
    const state = invitationState(invitation);
    if (state !== "pending") {
      return error(410, `That invitation has been ${state}`);
    }

    // Adopt mode's caller identity doesn't touch anything the seat race
    // below cares about, so it's resolved once, outside the transaction.
    const callerId = body.password ? null : await getUserIdFromRequest();

    // Everything from here on has to be one atomic unit: two people accepting
    // two different pending invitations to the same org at the same moment
    // could otherwise both read "1 seat free" from the same stale count and
    // both insert, blowing straight past the seat limit. A transaction alone
    // doesn't fix that -- two inserts of two different documents don't
    // conflict with each other -- so the org document itself is touched
    // first specifically to create a conflict: whichever request commits
    // first forces the other to retry from scratch, at which point it
    // re-reads the seat count including the first request's now-committed
    // insert and correctly sees the seat is gone.
    const client = await getMongoClient();
    const dbSession = client.startSession();
    let user: UserDoc;
    try {
      user = await dbSession.withTransaction(async () => {
        const [users, orgs] = await Promise.all([usersCollection(), organizationsCollection()]);
        const now = new Date();

        // Already in the org -- nothing to do, but don't burn the invitation.
        const alreadyMember = await users.findOne(
          { orgId: invitation.orgId, email: invitation.email },
          { session: dbSession },
        );
        if (alreadyMember) {
          throw new HttpError(409, "You're already a member of this organization");
        }

        const org = await orgs.findOneAndUpdate(
          { _id: invitation.orgId },
          { $set: { updatedAt: now } },
          { session: dbSession, returnDocument: "after" },
        );
        if (!org) {
          throw new HttpError(404, "That organization no longer exists");
        }

        const activeSeats = await users.countDocuments(
          { orgId: invitation.orgId, status: { $ne: "disabled" } },
          { session: dbSession },
        );
        const usage = { activeSeats, pendingInvitations: 0, seatLimit: org.settings.seatLimit };
        if (!hasSeatAvailable(usage, false)) {
          throw new HttpError(403, "This organization has no seats left. Ask an admin to free one up.");
        }

        const orphan = await users.findOne(
          { orgId: null, email: invitation.email },
          { session: dbSession },
        );
        let acceptedUser: UserDoc;

        if (body.password) {
          // An account already holds this address -- refuse to set a new
          // password on it. The holder must sign in and re-POST with an
          // empty body.
          if (orphan) {
            throw new HttpError(
              409,
              "An account already uses this email. Sign in to accept the invitation.",
              "account_exists",
            );
          }
          if (body.password.length < MIN_PASSWORD_LENGTH) {
            throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
          }

          const created = buildUserDoc({
            name: body.name?.trim() || invitation.name || invitation.email.split("@")[0]!,
            email: invitation.email,
            passwordHash: hashPassword(body.password),
            orgId: invitation.orgId,
            role: invitation.role,
            // Pinned by the admin who sent the invitation, if they set one.
            // The intro survey skips its department question when present.
            department: invitation.department,
            status: "active",
            lastLoginAt: now,
            now,
          });
          try {
            await users.insertOne(created, { session: dbSession });
          } catch (err) {
            if (err instanceof MongoServerError && err.code === 11000) {
              throw new HttpError(409, "An account with this email already exists.");
            }
            throw err;
          }
          acceptedUser = created;
        } else {
          // Adopt mode. Requires a session whose email matches the invitation
          // -- otherwise anyone holding the link could pull a stranger's
          // account in.
          if (!callerId) {
            throw new HttpError(401, "Sign in first, or choose a password to create an account.");
          }
          const caller = await users.findOne({ _id: callerId }, { session: dbSession });
          if (!caller || caller.email !== invitation.email) {
            throw new HttpError(403, "That invitation was sent to a different email address.");
          }
          if (caller.orgId) {
            throw new HttpError(409, "You already belong to an organization");
          }

          // Moves the row from the { email } partial unique index into
          // { orgId, email }, so no duplicate-key conflict and no data
          // migration. Keeps their XP, streak, badges, and attempt history.
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
            { session: dbSession, returnDocument: "after" },
          );
          if (!adopted) {
            throw new HttpError(409, "You already belong to an organization");
          }
          acceptedUser = adopted;
        }

        // Conditional on status:"pending" so a double-submit can't produce
        // two users off one invitation -- the second update matches nothing.
        const claimed = await invitations.findOneAndUpdate(
          { _id: invitation._id, status: "pending" },
          {
            $set: {
              status: "accepted",
              acceptedAt: now,
              acceptedUserId: acceptedUser._id,
              updatedAt: now,
            },
          },
          { session: dbSession },
        );
        if (!claimed) {
          throw new HttpError(410, "That invitation has already been accepted");
        }

        return acceptedUser;
      });
    } finally {
      await dbSession.endSession();
    }

    await createSession(user._id);

    return json(toUserDto(user), { status: 201 });
  },
);
