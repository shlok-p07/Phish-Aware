import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { GET, PATCH } = await import("./route");

const ME = new ObjectId();
const ORG = new ObjectId();

type Row = { id: string; title: string; read: boolean };

function seed(
  title: string,
  at: string,
  { userId = ME, read = false }: { userId?: ObjectId; read?: boolean } = {},
) {
  const id = new ObjectId();
  fakeDbState.notifications.push({
    _id: id,
    notificationId: id,
    userId,
    orgId: ORG,
    type: "reminder",
    title,
    body: "body",
    channel: "in_app",
    read,
    sentAt: new Date(at),
    subjectId: new ObjectId(),
    createdAt: new Date(at),
  });
  return id;
}

async function list(): Promise<Row[]> {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

function markRead(body?: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: JSON.stringify(body ?? {}),
    }),
  );
}

const stored = (id: ObjectId) => fakeDbState.notifications.find((n) => n._id === id);

describe("GET /api/notifications", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    fakeSessionState.userId = ME;
  });

  it("returns the caller's notifications newest first", async () => {
    seed("Older", "2026-08-01T00:00:00Z");
    seed("Newer", "2026-08-05T00:00:00Z");

    expect((await list()).map((r) => r.title)).toEqual(["Newer", "Older"]);
  });

  it("never returns somebody else's", async () => {
    seed("Mine", "2026-08-01T00:00:00Z");
    seed("Theirs", "2026-08-02T00:00:00Z", { userId: new ObjectId() });

    expect((await list()).map((r) => r.title)).toEqual(["Mine"]);
  });

  it("refuses an unauthenticated caller", async () => {
    fakeSessionState.userId = null;

    expect((await GET()).status).toBe(401);
  });
});

describe("PATCH /api/notifications", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    fakeSessionState.userId = ME;
  });

  it("marks the named notifications read", async () => {
    const id = seed("One", "2026-08-01T00:00:00Z");
    const other = seed("Two", "2026-08-02T00:00:00Z");

    const res = await markRead({ ids: [id.toString()] });

    expect(res.status).toBe(200);
    expect(stored(id)?.read).toBe(true);
    expect(stored(other)?.read).toBe(false);
  });

  it("marks everything unread when no ids are given", async () => {
    const a = seed("One", "2026-08-01T00:00:00Z");
    const b = seed("Two", "2026-08-02T00:00:00Z");

    const res = await markRead();

    expect((await res.json()).updated).toBe(2);
    expect(stored(a)?.read).toBe(true);
    expect(stored(b)?.read).toBe(true);
  });

  it("cannot mark somebody else's read, even given the id", async () => {
    const theirs = seed("Theirs", "2026-08-01T00:00:00Z", { userId: new ObjectId() });

    // An id list from a client is not proof of ownership, and hiding something
    // somebody was meant to see is the harm here.
    await markRead({ ids: [theirs.toString()] });

    expect(stored(theirs)?.read).toBe(false);
  });

  it("ignores ids that are not object ids", async () => {
    const id = seed("One", "2026-08-01T00:00:00Z");

    const res = await markRead({ ids: ["not-an-id", 7, null] });

    expect((await res.json()).updated).toBe(0);
    expect(stored(id)?.read).toBe(false);
  });

  it("treats a malformed body as a client error", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/notifications", {
        method: "PATCH",
        body: "{ not json",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("refuses an unauthenticated caller", async () => {
    fakeSessionState.userId = null;

    expect((await markRead()).status).toBe(401);
  });
});
