import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { auditLogsCollection, usersCollection, toObjectId } from "@/db";
import { json, requireOrgAdmin, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

/** How many entries one request returns. Enough to review, bounded on purpose. */
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * The organization's audit trail, newest first.
 *
 * Scoped to the caller's own organization, and actor names are resolved from the
 * same organization -- an entry naming somebody outside it would be a leak in the
 * one place that exists to be reviewed.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();

  const requested = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_PAGE_SIZE) : PAGE_SIZE;

  const entries = await (await auditLogsCollection())
    .find({ orgId: admin.orgId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  // Only the actors these entries name, and only inside this organization -- an
  // entry naming somebody outside it would be a leak in the one place that
  // exists to be reviewed.
  const actorIds = [...new Set(entries.map((e) => e.actorId.toString()))].map(toObjectId).filter(
    (id): id is ObjectId => id !== null,
  );
  const actors = actorIds.length
    ? await (await usersCollection()).find({ _id: { $in: actorIds }, orgId: admin.orgId }).toArray()
    : [];
  const nameById = new Map(actors.map((a) => [a._id.toString(), a.name]));

  return json(
    entries.map((entry) => ({
      id: entry._id.toString(),
      action: entry.action,
      // A removed admin's entries stay in the trail; the point of an audit log is
      // that it outlives the account.
      actor: nameById.get(entry.actorId.toString()) ?? "Former member",
      targetType: entry.targetType,
      targetId: entry.targetId ? entry.targetId.toString() : null,
      metadata: entry.metadata,
      at: entry.createdAt.toISOString(),
    })),
  );
});
