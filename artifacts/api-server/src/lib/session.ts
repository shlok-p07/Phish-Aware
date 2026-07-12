import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE = "phishaware_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(res: Response, userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ token, userId, expiresAt });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.clearCookie(SESSION_COOKIE);
}

export async function getUserIdFromRequest(req: Request): Promise<number | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token)).limit(1);
  if (!session) {
    return null;
  }
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    return null;
  }
  return session.userId;
}
