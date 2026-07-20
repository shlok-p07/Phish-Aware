import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db, sessionsTable, usersTable, attemptsTable } from "@/db";
import { and, eq, inArray, lt } from "drizzle-orm";

export const SESSION_COOKIE = "phishaware_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Guest sessions (and all their data) live for one hour only. */
export const GUEST_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Create a session row + set the httpOnly cookie. Returns the token. */
export async function createSession(
  userId: number,
  ttlMs: number = SESSION_TTL_MS,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(sessionsTable).values({ token, userId, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return token;
}

/** Delete the current session row (if any) and clear the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Resolve the authenticated user id from the session cookie, or null. */
export async function getUserIdFromRequest(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.token, token))
    .limit(1);
  if (!session) {
    return null;
  }
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    // A guest's window has closed — purge their account and all their data.
    await purgeGuestUser(session.userId);
    return null;
  }
  return session.userId;
}

/**
 * If the given user is a guest, delete their account, sessions, and every
 * attempt they recorded. No-op for real (signed-up) accounts.
 */
export async function purgeGuestUser(userId: number): Promise<void> {
  const [user] = await db
    .select({ isGuest: usersTable.isGuest })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user?.isGuest) {
    return;
  }
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, userId));
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

/**
 * Permanently delete a user account and everything attached to it — all
 * attempts, every session, and the user row — then clear the session cookie.
 */
export async function deleteAccount(userId: number): Promise<void> {
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, userId));
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Best-effort sweep of guest accounts older than the guest TTL whose window has
 * lapsed. Called opportunistically (e.g. when a new guest session starts) so
 * abandoned guest data doesn't linger past its hour.
 */
export async function purgeExpiredGuests(): Promise<void> {
  const cutoff = new Date(Date.now() - GUEST_SESSION_TTL_MS);
  const stale = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.isGuest, true), lt(usersTable.createdAt, cutoff)));
  if (stale.length === 0) {
    return;
  }
  const ids = stale.map((u) => u.id);
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, ids));
  await db.delete(sessionsTable).where(inArray(sessionsTable.userId, ids));
  await db.delete(usersTable).where(inArray(usersTable.id, ids));
}
