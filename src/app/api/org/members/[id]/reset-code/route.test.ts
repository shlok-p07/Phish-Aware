import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { POST } = await import("./route");

const ORG = new ObjectId();
const OTHER_ORG = new ObjectId();
const ADMIN = new ObjectId();

function seedAdmin() {
  fakeDbState.users.push({
    _id: ADMIN,
    orgId: ORG,
    role: "admin",
    name: "Admin",
    passwordHash: "hashed",
  });
  fakeSessionState.userId = ADMIN;
}

function seedMember(overrides: Record<string, unknown> = {}) {
  const id = new ObjectId();
  fakeDbState.users.push({
    _id: id,
    orgId: ORG,
    role: "employee",
    name: "Member",
    passwordHash: "hashed",
    passwordResetCodeHash: null,
    passwordResetExpiresAt: null,
    ...overrides,
  });
  return id;
}

function issue(id: ObjectId | string) {
  const s = id.toString();
  return POST(new NextRequest(`http://localhost/api/org/members/${s}/reset-code`, { method: "POST" }), {
    params: Promise.resolve({ id: s }),
  });
}

const stored = (id: ObjectId) => fakeDbState.users.find((u) => u._id === id);

describe("POST /api/org/members/[id]/reset-code", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("issues a code and stores only its hash", async () => {
    const id = seedMember();

    const res = await issue(id);
    const body = (await res.json()) as { code: string; expiresAt: string };

    expect(res.status).toBe(201);
    expect(body.code).toMatch(/^\d{6}$/);
    // The plaintext must never be what is persisted; the confirm route verifies
    // against the hash.
    expect(stored(id)?.passwordResetCodeHash).not.toBe(body.code);
    expect(stored(id)?.passwordResetCodeHash).toBeTruthy();
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("cannot issue a code for another organization's member", async () => {
    const id = seedMember({ orgId: OTHER_ORG });

    const res = await issue(id);

    expect(res.status).toBe(404);
    expect(stored(id)?.passwordResetCodeHash).toBeNull();
  });

  it("refuses a non-admin caller", async () => {
    const id = seedMember();
    const employee = seedMember();
    fakeSessionState.userId = employee;

    const res = await issue(id);

    expect(res.status).toBe(403);
    expect(stored(id)?.passwordResetCodeHash).toBeNull();
  });

  it("refuses an SSO-only account, which has no password to reset", async () => {
    const id = seedMember({ passwordHash: null });

    const res = await issue(id);

    expect(res.status).toBe(409);
    expect(stored(id)?.passwordResetCodeHash).toBeNull();
  });

  it("rejects a malformed member id", async () => {
    const res = await issue("not-an-object-id");

    expect(res.status).toBe(400);
  });

  it("replaces a previous code rather than accumulating them", async () => {
    const id = seedMember();

    const first = (await (await issue(id)).json()) as { code: string };
    const firstHash = stored(id)?.passwordResetCodeHash;
    const second = (await (await issue(id)).json()) as { code: string };

    expect(second.code).not.toBe("");
    expect(stored(id)?.passwordResetCodeHash).not.toBe(firstHash);
    expect(first.code).not.toBe(second.code);
  });
});
