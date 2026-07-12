import { Router, type IRouter } from "express";
import { ListLessonsResponse, GetLessonResponse, GetLessonParams } from "@workspace/api-zod";
import { LESSONS } from "../lib/lessons";

const router: IRouter = Router();

router.get("/lessons", (_req, res) => {
  const summaries = LESSONS.map(({ id, vector, title, summary }) => ({ id, vector, title, summary }));
  res.json(ListLessonsResponse.parse(summaries));
});

router.get("/lessons/:id", (req, res) => {
  const { id } = GetLessonParams.parse(req.params);
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  res.json(GetLessonResponse.parse(lesson));
});

export default router;
