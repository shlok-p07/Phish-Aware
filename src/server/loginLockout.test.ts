import { describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import type { Collection } from "mongodb";
import type { UserDoc } from "@/db";
import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  clearedLockoutFields,
  isLocked,
  lockedMessage,
  minutesRemaining,
  mustResetPassword,
  recordFailedAttempt,
} from "./loginLockout";

/** Minimal stand-in: recordFailedAttempt only ever calls updateOne. */
function fakeCollection() {
  const doc: Record<string, unknown> = {};
  const users = {
    updateOne: async (_filter: unknown, update: { $set?: Record<string, unknown> }) => {
      Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  return { doc, users: users as unknown as Collection<UserDoc> };
}

const NOW = new Date("2026-08-06T12:00:00.000Z");

describe("isLocked", () => {
  it("is false for a user that has never been locked", () => {
    expect(isLocked({}, NOW)).toBe(false);
    expect(isLocked({ lockedUntil: null }, NOW)).toBe(false);
  });

  it("is true while the lock is in the future and false once it passes", () => {
    expect(isLocked({ lockedUntil: new Date(NOW.getTime() + 1) }, NOW)).toBe(true);
    expect(isLocked({ lockedUntil: NOW }, NOW)).toBe(false);
    expect(isLocked({ lockedUntil: new Date(NOW.getTime() - 1) }, NOW)).toBe(false);
  });
});

describe("mustResetPassword", () => {
  it("defaults to false on legacy rows that predate the field", () => {
    expect(mustResetPassword({})).toBe(false);
  });

  it("is true once the flag is set", () => {
    expect(mustResetPassword({ mustResetPassword: true })).toBe(true);
  });
});

describe("minutesRemaining", () => {
  it("rounds up, so a partial minute still reads as a minute", () => {
    expect(minutesRemaining(new Date(NOW.getTime() + 90_000), NOW)).toBe(2);
    expect(minutesRemaining(new Date(NOW.getTime() + 60_000), NOW)).toBe(1);
  });

  it("never reports zero, even for a lock about to expire", () => {
    expect(minutesRemaining(new Date(NOW.getTime() + 1), NOW)).toBe(1);
    expect(minutesRemaining(NOW, NOW)).toBe(1);
  });

  it("reports the full window for a lock that was just set", () => {
    expect(minutesRemaining(new Date(NOW.getTime() + LOCKOUT_MS), NOW)).toBe(30);
  });
});

describe("lockedMessage", () => {
  it("says 30 minutes for a fresh lock and singularises the last one", () => {
    expect(lockedMessage(new Date(NOW.getTime() + LOCKOUT_MS), NOW)).toContain("30 more minutes");
    expect(lockedMessage(new Date(NOW.getTime() + 30_000), NOW)).toContain("1 more minute,");
  });
});

describe("recordFailedAttempt", () => {
  it("counts up without locking while attempts remain", async () => {
    const { doc, users } = fakeCollection();
    const lock = await recordFailedAttempt(
      users,
      { _id: new ObjectId(), failedLoginAttempts: 3 },
      NOW,
    );

    expect(lock).toBeNull();
    expect(doc.failedLoginAttempts).toBe(4);
    expect(doc.lockedUntil).toBeUndefined();
    expect(doc.mustResetPassword).toBeUndefined();
  });

  it("treats a missing counter as zero", async () => {
    const { doc, users } = fakeCollection();
    await recordFailedAttempt(users, { _id: new ObjectId() }, NOW);
    expect(doc.failedLoginAttempts).toBe(1);
  });

  it("locks for 30 minutes on the fifth consecutive failure", async () => {
    const { doc, users } = fakeCollection();
    const lock = await recordFailedAttempt(
      users,
      { _id: new ObjectId(), failedLoginAttempts: MAX_FAILED_ATTEMPTS - 1 },
      NOW,
    );

    expect(lock).toEqual(new Date(NOW.getTime() + LOCKOUT_MS));
    expect(doc.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(doc.lockedUntil).toEqual(new Date(NOW.getTime() + LOCKOUT_MS));
    expect(doc.mustResetPassword).toBe(true);
  });
});

describe("clearedLockoutFields", () => {
  it("undoes every part of a lockout", () => {
    expect(clearedLockoutFields()).toEqual({
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustResetPassword: false,
    });
  });
});
