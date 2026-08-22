import { lessonsCollection, usersCollection } from "@/db";
import { CompleteLessonResponse } from "@/api-zod";
import { markLessonComplete } from "@/server/lessonCompletion";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Records that the caller has finished this lesson.
 *
 * Idempotent, because the page calls it whenever the last screen is reached and
 * a learner may well go back and forward again. The lesson is looked up first so
 * a bogus id is a 404 rather than a completion row pointing at nothing.
 */
export const POST = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireUserId();
    const { id } = await params;

    // Lessons are keyed by slug, so the id needs no ObjectId parsing -- but it
    // does need to exist, or the completion would point at nothing.
    const lessons = await lessonsCollection();
    const lesson = await lessons.findOne({ _id: id }, { projection: { _id: 1 } });
    if (!lesson) {
      return error(404, "Lesson not found");
    }

    const users = await usersCollection();
    const user = await users.findOne({ _id: userId }, { projection: { orgId: 1 } });

    await markLessonComplete(userId, lesson._id, user?.orgId ?? null);
    return json(CompleteLessonResponse.parse({ completed: true }));
  },
);
