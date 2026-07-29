import { pgTable, serial, text, boolean, jsonb } from "drizzle-orm/pg-core";

export interface ScenarioCue {
  label: string; // CueId
  severity: "low" | "medium" | "high";
  explanation: string;
}

export const scenariosTable = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  vector: text("vector").notNull(),
  isPhish: boolean("is_phish").notNull(),
  sender: text("sender").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  links: jsonb("links").$type<string[]>().notNull().default([]),
  attachmentName: text("attachment_name"),
  cues: jsonb("cues").$type<ScenarioCue[]>().notNull().default([]),
  difficulty: text("difficulty").notNull().default("easy"),
  isOnboarding: boolean("is_onboarding").notNull().default(false),
});

export type InsertScenario = typeof scenariosTable.$inferInsert;
export type Scenario = typeof scenariosTable.$inferSelect;
