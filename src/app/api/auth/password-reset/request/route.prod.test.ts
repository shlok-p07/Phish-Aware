import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

// Set per test, not at module scope. Bun runs test files in one process, so
// mutating NODE_ENV at import time leaked into every other file that imported
// this route and made six unrelated tests fail.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
// NODE_ENV is typed read-only; this is a test deliberately exercising the
// production branch, so the cast is the point rather than a workaround.
const env = process.env as Record<string, string | undefined>;

await installMongoMock();
const { POST } = await import("./route");

function request(email: string) {
  return POST(
    new NextRequest("http://localhost/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
      headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
    }),
  );
}

describe("POST /api/auth/password-reset/request in production", () => {
  beforeEach(() => {
    resetFakeDbState();
    env.NODE_ENV = "production";
  });

  afterEach(() => {
    env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("never returns a code, even for a real account", async () => {
    fakeDbState.users.push({
      _id: new ObjectId(),
      email: "real@example.test",
      passwordHash: "hashed",
    });

    const res = await request("real@example.test");
    const body = (await res.json()) as { ok: boolean; code: string | null; delivery: string };

    // Handing the code back here is an unauthenticated account takeover: anyone
    // who knows the address gets in without ever touching the mailbox.
    expect(res.status).toBe(200);
    expect(body.code).toBeNull();
    expect(body.delivery).toBe("administrator");
  });

  it("answers identically for an address that has no account", async () => {
    fakeDbState.users.push({
      _id: new ObjectId(),
      email: "real@example.test",
      passwordHash: "hashed",
    });

    const real = (await (await request("real@example.test")).json()) as Record<string, unknown>;
    const absent = (await (await request("nobody@example.test")).json()) as Record<string, unknown>;

    // Differing responses confirm which addresses have accounts, which is a
    // roster of the customer's staff for anyone who asks.
    expect(real).toEqual(absent);
  });

  it("writes nothing, so it cannot invalidate a pending admin-issued code", async () => {
    const id = new ObjectId();
    fakeDbState.users.push({
      _id: id,
      email: "real@example.test",
      passwordHash: "hashed",
      passwordResetCodeHash: "issued-by-admin",
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
    });

    await request("real@example.test");

    expect(fakeDbState.users[0].passwordResetCodeHash).toBe("issued-by-admin");
  });
});
