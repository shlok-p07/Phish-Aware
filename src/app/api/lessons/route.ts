import { ListLessonsResponse } from "@/api-zod";
import { lessonsCollection } from "@/db";
import { json, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const lessons = await (await lessonsCollection())
    .find({}, { projection: { vector: 1, title: 1, summary: 1 } })
    .sort({ order: 1 })
    .toArray();
  return json(
    ListLessonsResponse.parse(
      lessons.map((l) => ({ id: l._id, vector: l.vector, title: l.title, summary: l.summary })),
    ),
  );
});
