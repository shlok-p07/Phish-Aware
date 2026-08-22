import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * That a learner has finished reading a lesson.
 *
 * Lessons existed as a library and nothing else: you could read all five screens
 * and the product recorded nothing. Campaigns could already name `lessonIds`, so
 * an admin could assign reading that a member had no way to complete -- the
 * assignment counted scenarios only and sat unfinished forever.
 *
 * One row per learner per lesson. Re-reading is fine and does not duplicate: the
 * unique index makes the write an upsert, and `completedAt` keeps the first time
 * they got there rather than the most recent visit.
 */
export interface LessonCompletionDoc extends SpecConventions {
  _id: ObjectId;
  lessonCompletionId: ObjectId; // named PK per the shared spec -- mirrors _id
  userId: ObjectId;
  /** The lesson's slug: lessons use string ids, not ObjectIds. */
  lessonId: string;
  /** Null for a self-signup learner, who can still work through the library. */
  orgId: ObjectId | null;
  completedAt: Date;
}

export type InsertLessonCompletion = Omit<LessonCompletionDoc, "_id">;

export const LESSON_COMPLETIONS_COLLECTION = "lessonCompletions";

export function lessonCompletionsCollection() {
  return getCollection<LessonCompletionDoc>(LESSON_COMPLETIONS_COLLECTION);
}
