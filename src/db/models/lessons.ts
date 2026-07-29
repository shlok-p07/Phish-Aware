import { getCollection } from "../client";

export interface LessonScreen {
  heading: string;
  body: string;
}

export interface LessonDoc {
  _id: string; // slug, e.g. "email-phishing" -- lessons don't need ObjectId ids
  vector: string;
  title: string;
  summary: string;
  screens: LessonScreen[];
  redFlags: string[];
  sortOrder: number;
}

export type InsertLesson = LessonDoc;

export const LESSONS_COLLECTION = "lessons";

export function lessonsCollection() {
  return getCollection<LessonDoc>(LESSONS_COLLECTION);
}
