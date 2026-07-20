import { ListLessonsResponse } from "@/api-zod";
import { db, lessonsTable } from "@/db";
import { asc } from "drizzle-orm";
import { json, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const lessons = await db
    .select({
      id: lessonsTable.id,
      vector: lessonsTable.vector,
      title: lessonsTable.title,
      summary: lessonsTable.summary,
    })
    .from(lessonsTable)
    .orderBy(asc(lessonsTable.sortOrder));
  return json(ListLessonsResponse.parse(lessons));
});
