import { describe, expect, it, beforeEach } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { installMongoMock, fakeDbState, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();

// createSession() calls next/headers' cookies(), which throws outside a real
// Next.js request scope. Faking it here isn't about avoiding that error --
// it's that this file is testing the seat-limit/invitation logic, not cookie
// plumbing, so a fake token is exactly as good as a real one for that.
await installSessionMock();

const { POST } = await import("./route");

function postAccept(token: string, body: Record<string, unknown> = {}) {
  return POST(
    new NextRequest(`http://localhost/api/invitations/${token}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );
}

const ORG_ID = new ObjectId();

function seedOrg(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: ORG_ID,
    orgId: ORG_ID,
    name: "Acme Corp",
    domain: null,
    ssoProvider: null,
    settings: { seatLimit: 0 },
    ...overrides,
  };
  fakeDbState.organizations.push(doc);
  return doc;
}

function seedInvitation(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new ObjectId(),
    token: "test-token",
    orgId: ORG_ID,
    email: "invitee@acme.test",
    name: null,
    role: "employee",
    department: null,
    status: "pending",
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    acceptedUserId: null,
    ...overrides,
  };
  fakeDbState.invitations.push(doc);
  return doc;
}

function seedActiveMember(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new ObjectId(),
    orgId: ORG_ID,
    email: "existing@acme.test",
    passwordHash: "hash",
    status: "active",
    ...overrides,
  };
  fakeDbState.users.push(doc);
  return doc;
}

beforeEach(() => {
  resetFakeDbState();
  resetFakeSessionState();
});

describe("POST /api/invitations/[token]/accept", () => {
  it("rejects an unknown token", async () => {
    seedOrg();
    const res = await postAccept("does-not-exist", { password: "password123" });
    expect(res.status).toBe(404);
  });

  it("rejects an already-accepted invitation", async () => {
    seedOrg();
    seedInvitation({ status: "accepted" });
    const res = await postAccept("test-token", { password: "password123" });
    expect(res.status).toBe(410);
  });

  it("creates the account and claims the invitation when a seat is free", async () => {
    seedOrg({ settings: { seatLimit: 5 } });
    seedInvitation();
    const res = await postAccept("test-token", { password: "password123" });

    expect(res.status).toBe(201);
    expect(fakeDbState.users).toHaveLength(1);
    expect(fakeDbState.invitations[0]!.status).toBe("accepted");
  });

  it("opens and closes exactly one MongoDB session per request", async () => {
    seedOrg({ settings: { seatLimit: 5 } });
    seedInvitation();
    await postAccept("test-token", { password: "password123" });

    expect(fakeDbState.sessionCalls.started).toBe(1);
    expect(fakeDbState.sessionCalls.ended).toBe(1);
  });

  it("refuses to accept once the org's seat limit is already full", async () => {
    seedOrg({ settings: { seatLimit: 1 } });
    seedActiveMember();
    seedInvitation();

    const res = await postAccept("test-token", { password: "password123" });
    expect(res.status).toBe(403);
    // Nothing got written on the rejected path.
    expect(fakeDbState.users).toHaveLength(1);
    expect(fakeDbState.invitations[0]!.status).toBe("pending");
  });

  it("still ends the session even when the seat check rejects the request", async () => {
    seedOrg({ settings: { seatLimit: 1 } });
    seedActiveMember();
    seedInvitation();
    await postAccept("test-token", { password: "password123" });

    expect(fakeDbState.sessionCalls.ended).toBe(1);
  });

  it("does not count a disabled member's old seat against the limit", async () => {
    seedOrg({ settings: { seatLimit: 1 } });
    seedActiveMember({ status: "disabled" });
    seedInvitation();

    const res = await postAccept("test-token", { password: "password123" });
    expect(res.status).toBe(201);
  });

  it("treats a seat limit of 0 as unlimited", async () => {
    seedOrg({ settings: { seatLimit: 0 } });
    for (let i = 0; i < 10; i++) seedActiveMember();
    seedInvitation();

    const res = await postAccept("test-token", { password: "password123" });
    expect(res.status).toBe(201);
  });

  it("refuses a second person accepting once one has already taken the last seat", async () => {
    seedOrg({ settings: { seatLimit: 1 } });
    seedInvitation();

    const first = await postAccept("test-token", { password: "password123" });
    expect(first.status).toBe(201);

    // A second, still-pending invitation to the same org.
    seedInvitation({ token: "second-token", email: "second@acme.test" });
    const second = await postAccept("second-token", { password: "password123" });
    expect(second.status).toBe(403);
  });

  it("rejects someone who is already a member without touching the invitation", async () => {
    seedOrg({ settings: { seatLimit: 5 } });
    seedInvitation();
    seedActiveMember({ email: "invitee@acme.test" });

    const res = await postAccept("test-token", { password: "password123" });
    expect(res.status).toBe(409);
    expect(fakeDbState.invitations[0]!.status).toBe("pending");
  });

  it("refuses a password shorter than the minimum", async () => {
    seedOrg({ settings: { seatLimit: 5 } });
    seedInvitation();
    const res = await postAccept("test-token", { password: "short" });
    expect(res.status).toBe(400);
  });

  it("tells an existing account holder to sign in instead of overwriting their password", async () => {
    seedOrg({ settings: { seatLimit: 5 } });
    seedInvitation();
    seedActiveMember({ orgId: null, email: "invitee@acme.test" });

    const res = await postAccept("test-token", { password: "password123" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("account_exists");
  });
});
