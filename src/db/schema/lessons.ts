import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

export interface LessonScreen {
  heading: string;
  body: string;
}

export const lessonsTable = pgTable("lessons", {
  id: text("id").primaryKey(),
  vector: text("vector").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  screens: jsonb("screens").$type<LessonScreen[]>().notNull().default([]),
  redFlags: jsonb("red_flags").$type<string[]>().notNull().default([]),
  // Controls display order in the lesson library (lower = earlier).
  sortOrder: integer("sort_order").notNull().default(0),
});

export type InsertLesson = typeof lessonsTable.$inferInsert;
export type Lesson = typeof lessonsTable.$inferSelect;
