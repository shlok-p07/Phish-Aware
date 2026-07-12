import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  isGuest: boolean("is_guest").notNull().default(false),
  level: text("level").notNull().default("beginner"),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  lastActiveDate: text("last_active_date"),
  badges: jsonb("badges").$type<string[]>().notNull().default([]),
  calibrationScore: real("calibration_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const sessionsTable = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type Session = typeof sessionsTable.$inferSelect;
