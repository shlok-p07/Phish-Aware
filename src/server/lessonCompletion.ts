import { ObjectId } from "mongodb";
import { lessonCompletionsCollection, specDefaults } from "@/db";

/**
 * Recording and reading which lessons a learner has finished.
 *
 * Kept out of the routes so the library listing, the lesson page and assignment
 * progress all agree on what "completed" means.
 */

/**
 * Marks a lesson finished, keeping the first completion date.
 *
 * $setOnInsert rather than $set on completedAt: re-reading a lesson should not
 * rewrite when it was learned, which is the figure an assignment's due date is
 * judged against. Idempotent, so the page can call it every time the last
 * screen is reached without guarding.
 */
export async function markLessonComplete(
  userId: ObjectId,
  lessonId: string,
  orgId: ObjectId | null,
  now: Date = new Date(),
): Promise<void> {
  const completions = await lessonCompletionsCollection();
  const id = new ObjectId();
  const { updatedAt: _updatedAt, ...insertOnly } = specDefaults(now);
  await completions.updateOne(
    { userId, lessonId },
    {
      $set: { orgId, updatedAt: now },
      $setOnInsert: {
        ...insertOnly,
        _id: id,
        lessonCompletionId: id,
        userId,
        lessonId,
        completedAt: now,
      },
    },
    { upsert: true },
  );
}

/** Lesson slugs this learner has finished. */
export async function completedLessonIds(userId: ObjectId): Promise<Set<string>> {
  const completions = await lessonCompletionsCollection();
  const rows = await completions.find({ userId }, { projection: { lessonId: 1 } }).toArray();
  return new Set(rows.map((r) => r.lessonId));
}

/** How many of a given set a learner has finished. Used for assignment progress. */
export async function countCompletedFrom(
  userId: ObjectId,
  lessonIds: readonly string[],
): Promise<number> {
  if (lessonIds.length === 0) return 0;
  const completions = await lessonCompletionsCollection();
  return completions.countDocuments({ userId, lessonId: { $in: [...lessonIds] } });
}
