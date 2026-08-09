import { describe, expect, it, beforeEach } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { installMongoMock, fakeDbState, resetFakeDbState } from "@/test/mock-mongo";
import { verifyPassword } from "@/server/password";
import { __resetRateLimits } from "@/server/rateLimit";

await installMongoMock();

const { POST } = await import("./route");

function postRequest(email: string, ip = "1.1.1.1") {
  return POST(
    new NextRequest("http://localhost/api/auth/password-reset/request", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email }),
    }),
  );
}

function seedUser(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new ObjectId(),
    email: "alice@acme.test",
    passwordHash: "some-real-hash",
    ...overrides,
  };
  fakeDbState.users.push(doc);
  return doc;
}

beforeEach(() => {
  resetFakeDbState();
  __resetRateLimits();
});

describe("POST /api/auth/password-reset/request", () => {
  it("returns a null code when no account matches the address, without revealing that via status", async () => {
    const res = await postRequest("nobody@acme.test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, code: null });
  });

  it("returns a real code for a matching account, hashed and stored the same way passwords are", async () => {
    const user = seedUser();
    const res = await postRequest(user.email as string);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(typeof body.code).toBe("string");
    expect(verifyPassword(body.code, fakeDbState.users[0]!.passwordResetCodeHash as string)).toBe(true);
  });

  it("never generates a code for a guest account with no password set", async () => {
    seedUser({ email: "guest@acme.test", passwordHash: null });
    const res = await postRequest("guest@acme.test");
    const body = await res.json();
    expect(body).toEqual({ ok: true, code: null });
  });

  it("does not generate a code when more than one account matches (ambiguous)", async () => {
    seedUser({ email: "dup@acme.test" });
    seedUser({ email: "dup@acme.test" });
    const res = await postRequest("dup@acme.test");
    const body = await res.json();
    expect(body).toEqual({ ok: true, code: null });
  });

  it("invalidates the previous code when a second request comes in before it's used", async () => {
    const user = seedUser();
    const first = await (await postRequest(user.email as string)).json();
    const second = await (await postRequest(user.email as string)).json();

    expect(first.code).not.toBe(second.code);
    // The first code no longer verifies against whatever is now stored.
    expect(
      verifyPassword(first.code, fakeDbState.users[0]!.passwordResetCodeHash as string),
    ).toBe(false);
    expect(
      verifyPassword(second.code, fakeDbState.users[0]!.passwordResetCodeHash as string),
    ).toBe(true);
  });

  it("matches the address case-insensitively", async () => {
    seedUser({ email: "mixedcase@acme.test" });
    const res = await postRequest("MixedCase@Acme.TEST");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.code).not.toBeNull();
  });

  it("rate limits repeated requests for the same address from the same source", async () => {
    const user = seedUser();
    for (let i = 0; i < 5; i++) {
      const res = await postRequest(user.email as string);
      expect(res.status).toBe(200);
    }
    const sixth = await postRequest(user.email as string);
    expect(sixth.status).toBe(429);
  });
});
