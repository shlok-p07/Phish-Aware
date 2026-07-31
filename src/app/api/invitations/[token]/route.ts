import { NextRequest } from "next/server";
import {
  invitationsCollection,
  organizationsCollection,
  usersCollection,
  ssoConnectionsCollection,
} from "@/db";
import { json, error, withErrorHandling } from "@/server/http";
import { invitationState } from "@/server/invitations";
import { rateLimit, clientIp } from "@/server/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public lookup: the token IS the credential, so no session is required.
 *
 * Returning the invited address is fine -- whoever holds the token was sent it
 * for that address. What this must not do is confirm anything about addresses
 * the caller didn't already name.
 */
export const GET = withErrorHandling(
  async (req: NextRequest, ctx: { params: Promise<{ token: string }> }) => {
    const limit = rateLimit(`invitation:${clientIp(req.headers)}`, 30, 60_000);
    if (!limit.ok) {
      return error(429, "Too many requests. Try again shortly.");
    }

    const { token } = await ctx.params;
    const invitations = await invitationsCollection();
    const invitation = await invitations.findOne({ token });
    if (!invitation) {
      return error(404, "That invitation link isn't valid");
    }

    const state = invitationState(invitation);
    if (state !== "pending") {
      return error(410, `That invitation has been ${state}`);
    }

    const [orgs, users, connections] = await Promise.all([
      organizationsCollection(),
      usersCollection(),
      ssoConnectionsCollection(),
    ]);
    const [org, existingAccount, connection] = await Promise.all([
      orgs.findOne({ _id: invitation.orgId }, { projection: { name: 1 } }),
      // An orgless account already using this address. They must sign in and
      // adopt rather than set a fresh password, so an invitation can never
      // absorb an account its sender doesn't control.
      users.findOne({ orgId: null, email: invitation.email }, { projection: { _id: 1 } }),
      connections.findOne(
        { orgId: invitation.orgId, enabled: true },
        { projection: { providerKind: 1 } },
      ),
    ]);

    const ssoAvailable = connection !== null;
    return json({
      orgName: org?.name ?? "your organization",
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
      ssoAvailable,
      ssoStartUrl: ssoAvailable
        ? `/api/auth/sso/start?email=${encodeURIComponent(invitation.email)}&redirectTo=%2Fonboarding`
        : null,
      requiresExistingAccount: existingAccount !== null,
    });
  },
);
