import { describe, expect, it, beforeEach } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { installUsersCollectionMock, fakeUsersState, resetFakeUsersState } from "@/test/mock-users-collection";
import { hashPassword, verifyPassword } from "@/server/password";
import { __resetRateLimits } from "@/server/rateLimit";

await installUsersCollectionMock();

const { POST } = await import("./route");

function postConfirm(body: { email: string; code: string; newPassword: string }, ip = "1.1.1.1") {
  return POST(
    new NextRequest("http://localhost/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

const CODE = "123456";
const EMAIL = "alice@acme.test";

function seedUser(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new ObjectId(),
    email: EMAIL,
    passwordHash: "old-hash",
    passwordResetCodeHash: hashPassword(CODE),
    passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    ...overrides,
  };
  fakeUsersState.docs.push(doc);
  return doc;
}

beforeEach(() => {
  resetFakeUsersState();
  __resetRateLimits();
});

describe("POST /api/auth/password-reset/confirm", () => {
  it("accepts the right code and sets the new password", async () => {
    seedUser();
    const res = await postConfirm({ email: EMAIL, code: CODE, newPassword: "brand-new-password" });
    expect(res.status).toBe(200);

    const user = fakeUsersState.docs[0]!;
    expect(verifyPassword("brand-new-password", user.passwordHash as string)).toBe(true);
  });

  it("clears the reset code once it's used, so it can't be replayed", async () => {
    seedUser();
    await postConfirm({ email: EMAIL, code: CODE, newPassword: "brand-new-password" });

    const user = fakeUsersState.docs[0]!;
    expect(user.passwordResetCodeHash).toBeNull();
    expect(user.passwordResetExpiresAt).toBeNull();
  });

  it("rejects reusing the same code a second time", async () => {
    seedUser();
    const first = await postConfirm({ email: EMAIL, code: CODE, newPassword: "first-new-password" });
    expect(first.status).toBe(200);

    const second = await postConfirm({ email: EMAIL, code: CODE, newPassword: "second-new-password" });
    expect(second.status).toBe(400);
  });

  it("rejects the wrong code", async () => {
    seedUser();
    const res = await postConfirm({ email: EMAIL, code: "000000", newPassword: "brand-new-password" });
    expect(res.status).toBe(400);
  });

  it("rejects a code that has already expired", async () => {
    seedUser({ passwordResetExpiresAt: new Date(Date.now() - 1) });
    const res = await postConfirm({ email: EMAIL, code: CODE, newPassword: "brand-new-password" });
    expect(res.status).toBe(400);
  });

  it("rejects when there is no reset in progress at all", async () => {
    seedUser({ passwordResetCodeHash: null, passwordResetExpiresAt: null });
    const res = await postConfirm({ email: EMAIL, code: CODE, newPassword: "brand-new-password" });
    expect(res.status).toBe(400);
  });

  it("unlocks an account that was locked out by failed sign-ins", async () => {
    // The reset is the self-service unlock -- otherwise a locked-out user with
    // a genuinely forgotten password would have to wait the 30 minutes out and
    // then still be told to reset.
    seedUser({
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
      mustResetPassword: true,
    });
    const res = await postConfirm({ email: EMAIL, code: CODE, newPassword: "brand-new-password" });
    expect(res.status).toBe(200);

    const user = fakeUsersState.docs[0]!;
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(user.mustResetPassword).toBe(false);
  });

  it("does not touch the password of an unrelated account sharing no code match", async () => {
    const other = seedUser({ email: "bob@acme.test", passwordHash: "bobs-hash" });
    seedUser();
    await postConfirm({ email: EMAIL, code: CODE, newPassword: "brand-new-password" });
    expect(other.passwordHash).toBe("bobs-hash");
  });
});
