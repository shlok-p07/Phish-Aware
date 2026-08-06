/**
 * Per-account brute-force lockout for password sign-in.
 *
 * Distinct from src/server/rateLimit.ts, and deliberately so: that one is an
 * in-process counter keyed by IP + email that slows down a burst from one
 * machine and forgets everything on restart. This is durable state on the user
 * document, so five wrong passwords spread across a fleet of IPs (or a server
 * redeploy) still lock the account.
 *
 * After MAX_FAILED_ATTEMPTS consecutive failures the account is locked for
 * LOCKOUT_MS and flagged mustResetPassword. The flag outlives the lock: when
 * the 30 minutes are up, the account still can't be signed into with a
 * password until it's been reset. Resetting the password (the normal
 * forgot-password flow) clears both immediately, which doubles as the
 * self-service unlock -- a locked-out user doesn't have to wait out the timer.
 */

import type { Collection } from "mongodb";
import type { UserDoc } from "@/db";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 30 * 60 * 1000;

// The codes the 4xx bodies carry live in lib/ so the sign-in page can match on
// them without importing this module.
export { ACCOUNT_LOCKED_CODE, PASSWORD_RESET_REQUIRED_CODE } from "@/lib/auth-errors";

type LockoutFields = Pick<UserDoc, "failedLoginAttempts" | "lockedUntil" | "mustResetPassword">;

/** Cleared state, written on successful sign-in and on password reset. */
export function clearedLockoutFields(): Required<LockoutFields> {
  return { failedLoginAttempts: 0, lockedUntil: null, mustResetPassword: false };
}

export function isLocked(user: LockoutFields, now: Date): boolean {
  return user.lockedUntil != null && user.lockedUntil.getTime() > now.getTime();
}

export function mustResetPassword(user: LockoutFields): boolean {
  return user.mustResetPassword === true;
}

/** Whole minutes left on the lock, rounded up -- never reported as 0. */
export function minutesRemaining(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

export function lockedMessage(lockedUntil: Date, now: Date): string {
  const minutes = minutesRemaining(lockedUntil, now);
  return (
    `Too many failed sign-in attempts. This account is locked for ${minutes} more ` +
    `minute${minutes === 1 ? "" : "s"}, and its password has to be reset before you ` +
    `can sign in again. Reset it now to unlock the account immediately.`
  );
}

export const RESET_REQUIRED_MESSAGE =
  "This account was locked after too many failed sign-in attempts. Reset your password to sign in again.";

/**
 * Record one failed password attempt against `user`.
 *
 * Returns the lock this attempt created, or null if the account still has
 * attempts left. An account that is already locked is never passed here -- the
 * caller filters those out first -- so a guesser can't keep extending a lock.
 */
export async function recordFailedAttempt(
  users: Collection<UserDoc>,
  user: Pick<UserDoc, "_id"> & LockoutFields,
  now: Date,
): Promise<Date | null> {
  const failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;

  if (failedLoginAttempts < MAX_FAILED_ATTEMPTS) {
    await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts, updatedAt: now } });
    return null;
  }

  const lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
  await users.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts, lockedUntil, mustResetPassword: true, updatedAt: now } },
  );
  return lockedUntil;
}
