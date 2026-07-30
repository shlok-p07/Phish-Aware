import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

export interface LessonScreen {
  heading: string;
  body: string;
}

export interface LessonDoc extends SpecConventions {
  _id: string; // slug, e.g. "email-phishing" -- lessons don't need ObjectId ids
  lessonId: string; // named PK per the shared spec -- mirrors _id (string here, see 01-validators.js)
  vector: string;
  title: string;
  summary: string;
  screens: LessonScreen[];
  redFlags: string[];
  difficulty: number;
  order: number; // renamed from sortOrder to match the shared spec's field name
}

export type InsertLesson = LessonDoc;

export const LESSONS_COLLECTION = "lessons";

export function lessonsCollection() {
  return getCollection<LessonDoc>(LESSONS_COLLECTION);
}
