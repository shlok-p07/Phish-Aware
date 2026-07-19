import { ListLessonsResponse } from "@/api-zod";
import { LESSONS } from "@/server/lessons";
import { json, withErrorHandling } from "@/server/http";

export const GET = withErrorHandling(async () => {
  const summaries = LESSONS.map(({ id, vector, title, summary }) => ({
    id,
    vector,
    title,
    summary,
  }));
  return json(ListLessonsResponse.parse(summaries));
});
