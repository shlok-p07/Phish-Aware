import type { NextRequest } from "next/server";
import type { Filter } from "mongodb";
import { usersCollection, type UserDoc } from "@/db";
import { GetLeaderboardResponse } from "@/api-zod";
import { json, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

/** Ranked population. An organisation boundary applies to both. */
export type LeaderboardScope = "department" | "organization";

function parseScope(raw: string | null): LeaderboardScope | null {
  return raw === "department" || raw === "organization" ? raw : null;
}

/**
 * The leaderboard for the caller's department, or their whole organisation.
 *
 * This previously ran `.find()` with no filter and no authentication, so an
 * unauthenticated caller received twenty real names with their experience
 * points and level, drawn from every organisation at once. Tenant isolation is
 * the one property a B2B product cannot get wrong, so the organisation boundary
 * below is unconditional: it is applied whatever scope is asked for, and there
 * is no parameter that can widen it.
 *
 * Within that boundary, department is the default. In an enterprise the useful
 * comparison is against the people doing your job, not against the whole
 * payroll, and a department is also small enough that a rank means something.
 * `?scope=organization` widens to the full organisation for anyone who wants it.
 *
 * A caller with no organisation has `orgId: null` -- but so does every other
 * self-signup user on the deployment, so scoping on that alone ranked strangers
 * against each other and showed them each other's names. `orgId: null` is not a
 * tenant. Such a caller is ranked against the seeded demo fixtures and
 * themselves, which keeps the board populated without disclosing anybody.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const currentUserId = await requireUserId();
  const users = await usersCollection();

  const me = await users.findOne({ _id: currentUserId });
  const orgId = me?.orgId ?? null;
  const department = me?.department ?? null;

  const requested = parseScope(req.nextUrl.searchParams.get("scope"));
  // Department is the default only when the caller actually has one; asking for
  // it without one would otherwise rank them against everybody with no
  // department, which is not a department.
  const scope: LeaderboardScope =
    requested === "organization" || department === null ? "organization" : "department";

  const filter: Filter<UserDoc> = {
    orgId,
    // A disabled member keeps their history but should not appear in a ranking.
    // `$ne` also matches documents with no status field, which is what the
    // seeded sample users have.
    status: { $ne: "disabled" },
    ...(scope === "department" ? { department } : {}),
    // Inside an organisation, every member is a colleague and belongs on the
    // board. Outside one, the only rows a caller is entitled to see are the demo
    // fixtures and their own, because the other `orgId: null` rows are unrelated
    // people who happen to have signed up to the same deployment.
    ...(orgId === null
      ? { $or: [{ isDemo: true }, { _id: currentUserId }] }
      : { isDemo: { $ne: true } }),
  };

  const ranked = await users.find(filter).sort({ xp: -1 }).limit(20).toArray();

  const entries = ranked.map((u, i) => ({
    rank: i + 1,
    name: u.name,
    xp: u.xp,
    level: u.level as "beginner" | "intermediate" | "advanced",
    isCurrentUser: u._id.equals(currentUserId),
  }));
  return json(GetLeaderboardResponse.parse(entries));
});
