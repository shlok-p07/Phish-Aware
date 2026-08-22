import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import {
  fakeCookieState,
  installNextHeadersMock,
  resetFakeCookieState,
} from "@/test/mock-next-headers";

await installMongoMock();
await installNextHeadersMock();

const {
  SESSION_COOKIE,
  GUEST_SESSION_TTL_MS,
  createSession,
  createSessionRow,
  deleteAccount,
  destroySession,
  getUserIdFromRequest,
  purgeExpiredGuests,
  purgeGuestUser,
  sessionCookieOptions,
} = await import("./session");

const env = process.env as Record<string, string | undefined>;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function seedUser(overrides: Record<string, unknown> = {}) {
  const id = new ObjectId();
  fakeDbState.users.push({
    _id: id,
    userId: id,
    name: "Someone",
    isGuest: false,
    createdAt: new Date(),
    ...overrides,
  });
  return id;
}

function seedSession(userId: ObjectId, expiresAt: Date, token = "tok-" + Math.random()) {
  fakeDbState.sessions.push({
    _id: new ObjectId(),
    token,
    userId,
    createdAt: new Date(),
    expiresAt,
  });
  fakeCookieState.jar.set(SESSION_COOKIE, { value: token, options: {} });
  return token;
}

function seedAssignment(userId: ObjectId) {
  fakeDbState.assignments.push({
    _id: new ObjectId(),
    userId,
    campaignId: new ObjectId(),
    orgId: new ObjectId(),
    status: "assigned",
  });
}

function seedAttempt(userId: ObjectId) {
  fakeDbState.attempts.push({ _id: new ObjectId(), userId, correct: true });
}

describe("sessionCookieOptions", () => {
  beforeEach(() => {
    env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("is httpOnly and lax, so script cannot read it and it survives a normal navigation", () => {
    const options = sessionCookieOptions(new Date(Date.now() + 1000));
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("is Secure in production and not in development", () => {
    env.NODE_ENV = "production";
    expect(sessionCookieOptions(new Date()).secure).toBe(true);
    env.NODE_ENV = "development";
    // Requiring Secure on plain-HTTP localhost would stop the cookie being set
    // at all, so this differs by environment on purpose.
    expect(sessionCookieOptions(new Date()).secure).toBe(false);
  });
});

describe("getUserIdFromRequest", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeCookieState();
  });

  it("resolves the user for a live session", async () => {
    const id = seedUser();
    seedSession(id, new Date(Date.now() + 60_000));

    const resolved = await getUserIdFromRequest();

    expect(resolved?.toString()).toBe(id.toString());
  });

  it("returns null when there is no cookie", async () => {
    expect(await getUserIdFromRequest()).toBeNull();
  });

  it("returns null for a token with no matching session", async () => {
    fakeCookieState.jar.set(SESSION_COOKIE, { value: "forged-token", options: {} });

    expect(await getUserIdFromRequest()).toBeNull();
  });

  it("refuses an expired session and deletes the row", async () => {
    const id = seedUser();
    seedSession(id, new Date(Date.now() - 1));

    expect(await getUserIdFromRequest()).toBeNull();
    // Left behind, the row would keep being looked up on every request and
    // would come back to life if the clock ever moved backwards.
    expect(fakeDbState.sessions).toHaveLength(0);
  });

  it("purges a guest and their data once their window closes", async () => {
    const id = seedUser({ isGuest: true });
    seedAttempt(id);
    seedSession(id, new Date(Date.now() - 1));

    expect(await getUserIdFromRequest()).toBeNull();
    expect(fakeDbState.users).toHaveLength(0);
    expect(fakeDbState.attempts).toHaveLength(0);
  });

  it("keeps a real account when its session expires", async () => {
    const id = seedUser({ isGuest: false });
    seedAttempt(id);
    seedSession(id, new Date(Date.now() - 1));

    expect(await getUserIdFromRequest()).toBeNull();
    // An expired session is a sign-in prompt, not a reason to delete somebody's
    // account and history.
    expect(fakeDbState.users).toHaveLength(1);
    expect(fakeDbState.attempts).toHaveLength(1);
  });
});

describe("createSession", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeCookieState();
  });

  it("writes a row and sets the cookie with the row's own expiry", async () => {
    const id = seedUser();

    const token = await createSession(id, 5_000);

    const stored = fakeDbState.sessions[0];
    expect(stored.token).toBe(token);
    const cookie = fakeCookieState.jar.get(SESSION_COOKIE)!;
    expect(cookie.value).toBe(token);
    expect((cookie.options.expires as Date).getTime()).toBe(
      (stored.expiresAt as Date).getTime(),
    );
    expect(cookie.options.httpOnly).toBe(true);
  });

  it("issues an unguessable token, and a different one each time", async () => {
    const id = seedUser();

    const a = await createSessionRow(id);
    const b = await createSessionRow(id);

    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("destroySession", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeCookieState();
  });

  it("deletes the row and clears the cookie", async () => {
    const id = seedUser();
    seedSession(id, new Date(Date.now() + 60_000));

    await destroySession();

    // Clearing only the cookie would leave a token that still authenticates if
    // anyone kept a copy of it.
    expect(fakeDbState.sessions).toHaveLength(0);
    expect(fakeCookieState.deleted).toContain(SESSION_COOKIE);
  });

  it("still clears the cookie when there is no row to delete", async () => {
    fakeCookieState.jar.set(SESSION_COOKIE, { value: "stale", options: {} });

    await destroySession();

    expect(fakeCookieState.deleted).toContain(SESSION_COOKIE);
  });

  it("does not touch anybody else's session", async () => {
    const mine = seedUser();
    const theirs = seedUser();
    seedSession(theirs, new Date(Date.now() + 60_000), "theirs");
    seedSession(mine, new Date(Date.now() + 60_000), "mine");

    await destroySession();

    expect(fakeDbState.sessions.map((s) => s.token)).toEqual(["theirs"]);
  });
});

describe("purgeGuestUser", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeCookieState();
  });

  it("removes a guest, their attempts and their sessions", async () => {
    const id = seedUser({ isGuest: true });
    seedAttempt(id);
    seedSession(id, new Date(Date.now() + 60_000));

    await purgeGuestUser(id);

    expect(fakeDbState.users).toHaveLength(0);
    expect(fakeDbState.attempts).toHaveLength(0);
    expect(fakeDbState.sessions).toHaveLength(0);
  });

  it("is a no-op for a real account", async () => {
    const id = seedUser({ isGuest: false });
    seedAttempt(id);

    await purgeGuestUser(id);

    expect(fakeDbState.users).toHaveLength(1);
    expect(fakeDbState.attempts).toHaveLength(1);
  });

  it("leaves other guests alone", async () => {
    const mine = seedUser({ isGuest: true });
    const other = seedUser({ isGuest: true });
    seedAttempt(other);

    await purgeGuestUser(mine);

    expect(fakeDbState.users.map((u) => u._id.toString())).toEqual([other.toString()]);
    expect(fakeDbState.attempts).toHaveLength(1);
  });
});

describe("deleteAccount", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeCookieState();
  });

  it("removes the account, its history and its sessions, and signs them out", async () => {
    const id = seedUser();
    seedAttempt(id);
    seedSession(id, new Date(Date.now() + 60_000));

    await deleteAccount(id);

    expect(fakeDbState.users).toHaveLength(0);
    expect(fakeDbState.attempts).toHaveLength(0);
    expect(fakeDbState.sessions).toHaveLength(0);
    expect(fakeCookieState.deleted).toContain(SESSION_COOKIE);
  });

  it("deletes only the requested account", async () => {
    const mine = seedUser();
    const theirs = seedUser();
    seedAttempt(theirs);

    await deleteAccount(mine);

    expect(fakeDbState.users.map((u) => u._id.toString())).toEqual([theirs.toString()]);
    expect(fakeDbState.attempts).toHaveLength(1);
  });
});

describe("purgeExpiredGuests", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeCookieState();
  });

  it("removes guests whose hour has lapsed", async () => {
    const stale = seedUser({
      isGuest: true,
      createdAt: new Date(Date.now() - GUEST_SESSION_TTL_MS - 1000),
    });
    seedAttempt(stale);

    await purgeExpiredGuests();

    expect(fakeDbState.users).toHaveLength(0);
    expect(fakeDbState.attempts).toHaveLength(0);
  });

  it("leaves a guest still inside their window", async () => {
    seedUser({ isGuest: true, createdAt: new Date() });

    await purgeExpiredGuests();

    expect(fakeDbState.users).toHaveLength(1);
  });

  it("never touches a real account, however old", async () => {
    seedUser({ isGuest: false, createdAt: new Date(2020, 0, 1) });

    await purgeExpiredGuests();

    expect(fakeDbState.users).toHaveLength(1);
  });

  it("does nothing when there is nothing stale", async () => {
    seedUser({ isGuest: false });

    await purgeExpiredGuests();

    expect(fakeDbState.users).toHaveLength(1);
  });
});

describe("assignment cleanup", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeCookieState();
  });

  it("deleteAccount removes the account's assignments", async () => {
    const id = seedUser();
    seedAssignment(id);

    await deleteAccount(id);

    // Left behind these point at a user who no longer exists, and still count
    // toward the org's assignment totals.
    expect(fakeDbState.assignments).toHaveLength(0);
  });

  it("deleteAccount leaves other people's assignments alone", async () => {
    const mine = seedUser();
    const theirs = seedUser();
    seedAssignment(theirs);

    await deleteAccount(mine);

    expect(fakeDbState.assignments).toHaveLength(1);
  });

  it("purging a guest removes their assignments", async () => {
    const id = seedUser({ isGuest: true });
    seedAssignment(id);

    await purgeGuestUser(id);

    expect(fakeDbState.assignments).toHaveLength(0);
  });

  it("the expired-guest sweep removes their assignments", async () => {
    const id = seedUser({
      isGuest: true,
      createdAt: new Date(Date.now() - GUEST_SESSION_TTL_MS - 1000),
    });
    seedAssignment(id);

    await purgeExpiredGuests();

    expect(fakeDbState.assignments).toHaveLength(0);
  });
});
