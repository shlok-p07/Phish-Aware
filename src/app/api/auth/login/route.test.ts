import { describe, expect, it, beforeEach } from "bun:test";
import { NextRequest } from "next/server";
import { installMongoMock, fakeDbState, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";
import { hashPassword } from "@/server/password";
import { __resetRateLimits } from "@/server/rateLimit";
import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS } from "@/server/loginLockout";
import { ACCOUNT_LOCKED_CODE, PASSWORD_RESET_REQUIRED_CODE } from "@/lib/auth-errors";
import { buildUserDoc } from "@/server/users";

await installMongoMock();
// The route only needs a session to exist; the cookie plumbing is next/headers'
// problem and is covered by src/server/session.ts's own tests.
await installSessionMock();

const { POST } = await import("./route");

const EMAIL = "alice@acme.test";
const PASSWORD = "correct-horse-battery";

function postLogin(password: string, email = EMAIL, ip = "1.1.1.1") {
  return POST(
    new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password }),
    }),
  );
}

function seedUser(overrides: Partial<Record<string, unknown>> = {}) {
  const doc = {
    ...buildUserDoc({ name: "Alice", email: EMAIL, passwordHash: hashPassword(PASSWORD) }),
    ...overrides,
  };
  fakeDbState.users.push(doc as never);
  return doc as Record<string, unknown>;
}

/** Wrong password N times. The rate limiter allows 10/minute, so N <= 10. */
async function failTimes(n: number) {
  const responses = [];
  for (let i = 0; i < n; i++) {
    responses.push(await postLogin("wrong-password"));
  }
  return responses;
}

beforeEach(() => {
  resetFakeDbState();
  __resetRateLimits();
  resetFakeSessionState();
});

describe("POST /api/auth/login: lockout", () => {
  it("lets the right password through and leaves no failure state behind", async () => {
    const user = seedUser();
    const res = await postLogin(PASSWORD);

    expect(res.status).toBe(200);
    expect(fakeSessionState.createdCount).toBe(1);
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(user.mustResetPassword).toBe(false);
  });

  it("counts wrong passwords without locking before the fifth", async () => {
    const user = seedUser();
    const responses = await failTimes(MAX_FAILED_ATTEMPTS - 1);

    expect(responses.every((r) => r.status === 401)).toBe(true);
    expect(user.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS - 1);
    expect(user.lockedUntil).toBeNull();
    expect(user.mustResetPassword).toBe(false);
  });

  it("locks for 30 minutes on the fifth wrong password", async () => {
    const user = seedUser();
    const responses = await failTimes(MAX_FAILED_ATTEMPTS);
    const last = responses.at(-1)!;

    expect(last.status).toBe(423);
    expect(await last.json()).toMatchObject({ code: ACCOUNT_LOCKED_CODE });

    const lockedUntil = user.lockedUntil as Date;
    const remaining = lockedUntil.getTime() - Date.now();
    expect(remaining).toBeGreaterThan(LOCKOUT_MS - 5_000);
    expect(remaining).toBeLessThanOrEqual(LOCKOUT_MS);
  });

  it("refuses even the correct password while the lock is live", async () => {
    seedUser();
    await failTimes(MAX_FAILED_ATTEMPTS);

    const res = await postLogin(PASSWORD);
    expect(res.status).toBe(423);
    expect(await res.json()).toMatchObject({ code: ACCOUNT_LOCKED_CODE });
    expect(fakeSessionState.createdCount).toBe(0);
  });

  it("does not extend a live lock when guessing continues", async () => {
    const user = seedUser();
    await failTimes(MAX_FAILED_ATTEMPTS);
    const firstLock = (user.lockedUntil as Date).getTime();

    await postLogin("still-wrong");
    expect((user.lockedUntil as Date).getTime()).toBe(firstLock);
    expect(user.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS);
  });

  it("a successful sign-in resets the counter, so failures have to be consecutive", async () => {
    const user = seedUser();
    await failTimes(MAX_FAILED_ATTEMPTS - 1);
    expect((await postLogin(PASSWORD)).status).toBe(200);
    expect(user.failedLoginAttempts).toBe(0);

    const res = await postLogin("wrong-password");
    expect(res.status).toBe(401);
    expect(user.failedLoginAttempts).toBe(1);
    expect(user.lockedUntil).toBeNull();
  });

  it("still demands a reset once the 30 minutes have elapsed", async () => {
    const user = seedUser({
      lockedUntil: new Date(Date.now() - 1),
      mustResetPassword: true,
      failedLoginAttempts: MAX_FAILED_ATTEMPTS,
    });

    const res = await postLogin(PASSWORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: PASSWORD_RESET_REQUIRED_CODE });
    expect(fakeSessionState.createdCount).toBe(0);
    expect(user.mustResetPassword).toBe(true);
  });

  it("signs in normally once the reset has cleared the flag", async () => {
    seedUser({
      lockedUntil: null,
      mustResetPassword: false,
      failedLoginAttempts: 0,
      passwordHash: hashPassword("brand-new-password"),
    });

    const res = await postLogin("brand-new-password");
    expect(res.status).toBe(200);
    expect(fakeSessionState.createdCount).toBe(1);
  });

  it("treats a legacy row with no lockout fields as unlocked", async () => {
    const user = seedUser();
    delete user.failedLoginAttempts;
    delete user.lockedUntil;
    delete user.mustResetPassword;

    expect((await postLogin(PASSWORD)).status).toBe(200);
  });

  it("does not charge a failure to an unrelated account", async () => {
    const other = seedUser({ email: "bob@acme.test" });
    seedUser();
    await failTimes(MAX_FAILED_ATTEMPTS);

    expect(other.failedLoginAttempts).toBe(0);
    expect(other.lockedUntil).toBeNull();
  });

  it("returns a plain 401 for an email with no account at all", async () => {
    const res = await postLogin("anything", "nobody@acme.test");
    expect(res.status).toBe(401);
  });
});
