import { pgTable, serial, text, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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

export const insertScenarioSchema = createInsertSchema(scenariosTable).omit({ id: true });
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type Scenario = typeof scenariosTable.$inferSelect;
