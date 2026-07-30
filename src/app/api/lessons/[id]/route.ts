import { NextRequest } from "next/server";
import { GetLessonParams, GetLessonResponse } from "@/api-zod";
import { lessonsCollection } from "@/db";
import { json, error, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = GetLessonParams.parse(await ctx.params);
    const lesson = await (await lessonsCollection()).findOne({ _id: id });
    if (!lesson) {
      return error(404, "Lesson not found");
    }
    return json(
      GetLessonResponse.parse({
        id: lesson._id,
        vector: lesson.vector,
        title: lesson.title,
        summary: lesson.summary,
        screens: lesson.screens,
        redFlags: lesson.redFlags,
      }),
    );
  },
);
