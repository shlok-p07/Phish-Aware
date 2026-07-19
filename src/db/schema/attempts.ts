import { pgTable, serial, integer, boolean, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const attemptsTable = pgTable("attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  scenarioId: integer("scenario_id").notNull(),
  userVerdict: boolean("user_verdict").notNull(),
  selectedCues: jsonb("selected_cues").$type<string[]>().notNull().default([]),
  confidence: integer("confidence").notNull(),
  correct: boolean("correct").notNull(),
  missedCues: jsonb("missed_cues").$type<string[]>().notNull().default([]),
  falseCues: jsonb("false_cues").$type<string[]>().notNull().default([]),
  caughtCues: jsonb("caught_cues").$type<string[]>().notNull().default([]),
  explanation: text("explanation").notNull(),
  calibrationNote: text("calibration_note").notNull(),
  xpAwarded: integer("xp_awarded").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertAttempt = typeof attemptsTable.$inferInsert;
export type Attempt = typeof attemptsTable.$inferSelect;
