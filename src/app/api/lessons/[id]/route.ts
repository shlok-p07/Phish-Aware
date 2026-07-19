import { NextRequest } from "next/server";
import { GetLessonParams, GetLessonResponse } from "@/api-zod";
import { LESSONS } from "@/server/lessons";
import { json, error, withErrorHandling } from "@/server/http";

export const GET = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = GetLessonParams.parse(await ctx.params);
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) {
      return error(404, "Lesson not found");
    }
    return json(GetLessonResponse.parse(lesson));
  },
);
