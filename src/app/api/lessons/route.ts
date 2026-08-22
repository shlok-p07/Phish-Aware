import { ListLessonsResponse } from "@/api-zod";
import { lessonsCollection } from "@/db";
import { completedLessonIds } from "@/server/lessonCompletion";
import { json, optionalUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const lessons = await (await lessonsCollection())
    .find({}, { projection: { vector: 1, title: 1, summary: 1 } })
    .sort({ order: 1 })
    .toArray();

  // The library is readable signed out, so completion is simply empty then
  // rather than the whole listing failing.
  const userId = await optionalUserId();
  const completed = userId ? await completedLessonIds(userId) : new Set<string>();

  return json(
    ListLessonsResponse.parse(
      lessons.map((l) => ({
        id: l._id,
        vector: l.vector,
        title: l.title,
        summary: l.summary,
        completed: completed.has(l._id.toString()),
      })),
    ),
  );
});
