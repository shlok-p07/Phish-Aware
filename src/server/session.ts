import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { sessionsCollection, usersCollection, attemptsCollection } from "@/db";

export const SESSION_COOKIE = "phishaware_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Guest sessions (and all their data) live for one hour only. */
export const GUEST_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Create a session row + set the httpOnly cookie. Returns the token. */
export async function createSession(
  userId: ObjectId,
  ttlMs: number = SESSION_TTL_MS,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlMs);
  const sessions = await sessionsCollection();
  await sessions.insertOne({ _id: new ObjectId(), token, userId, createdAt, expiresAt });
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
    const sessions = await sessionsCollection();
    await sessions.deleteOne({ token });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Resolve the authenticated user id from the session cookie, or null. */
export async function getUserIdFromRequest(): Promise<ObjectId | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const sessions = await sessionsCollection();
  const session = await sessions.findOne({ token });
  if (!session) {
    return null;
  }
  if (session.expiresAt.getTime() < Date.now()) {
    await sessions.deleteOne({ token });
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
export async function purgeGuestUser(userId: ObjectId): Promise<void> {
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId }, { projection: { isGuest: 1 } });
  if (!user?.isGuest) {
    return;
  }
  const attempts = await attemptsCollection();
  const sessions = await sessionsCollection();
  await attempts.deleteMany({ userId });
  await sessions.deleteMany({ userId });
  await users.deleteOne({ _id: userId });
}

/**
 * Permanently delete a user account and everything attached to it — all
 * attempts, every session, and the user row — then clear the session cookie.
 */
export async function deleteAccount(userId: ObjectId): Promise<void> {
  const users = await usersCollection();
  const attempts = await attemptsCollection();
  const sessions = await sessionsCollection();
  await attempts.deleteMany({ userId });
  await sessions.deleteMany({ userId });
  await users.deleteOne({ _id: userId });
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
  const users = await usersCollection();
  const stale = await users
    .find({ isGuest: true, createdAt: { $lt: cutoff } }, { projection: { _id: 1 } })
    .toArray();
  if (stale.length === 0) {
    return;
  }
  const ids = stale.map((u) => u._id);
  const attempts = await attemptsCollection();
  const sessions = await sessionsCollection();
  await attempts.deleteMany({ userId: { $in: ids } });
  await sessions.deleteMany({ userId: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
}
