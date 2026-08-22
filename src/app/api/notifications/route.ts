import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { notificationsCollection, toObjectId } from "@/db";
import { json, requireUserId, withErrorHandling, readJsonBody } from "@/server/http";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

/** The caller's own notifications, newest first. */
export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const rows = await (await notificationsCollection())
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(PAGE_SIZE)
    .toArray();

  return json(
    rows.map((row) => ({
      id: row._id.toString(),
      type: row.type,
      title: row.title,
      body: row.body,
      read: row.read === true,
      at: (row.sentAt ?? row.createdAt).toISOString(),
    })),
  );
});

/**
 * Mark notifications read.
 *
 * Scoped by userId in the filter rather than trusting the ids: an id list from a
 * client is not proof of ownership, and marking somebody else's notifications
 * read would hide something they were meant to see.
 */
export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = (await readJsonBody(req)) as { ids?: unknown };

  const notifications = await notificationsCollection();
  if (Array.isArray(body.ids)) {
    const ids = body.ids
      .filter((id): id is string => typeof id === "string")
      .map(toObjectId)
      .filter((id): id is ObjectId => id !== null);
    if (ids.length === 0) {
      return json({ updated: 0 });
    }
    const result = await notifications.updateMany(
      { userId, _id: { $in: ids } },
      { $set: { read: true, updatedAt: new Date() } },
    );
    return json({ updated: result.modifiedCount });
  }

  // No ids means "all of mine", which is what a "mark all read" control sends.
  const result = await notifications.updateMany(
    { userId, read: false },
    { $set: { read: true, updatedAt: new Date() } },
  );
  return json({ updated: result.modifiedCount });
});
