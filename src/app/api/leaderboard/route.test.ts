import { describe, expect, it, beforeEach } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { installMongoMock, fakeDbState, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { GET } = await import("./route");

const ME = new ObjectId();
const ORG_A = new ObjectId();
const ORG_B = new ObjectId();

function user(
  name: string,
  xp: number,
  orgId: ObjectId | null,
  extra: Record<string, unknown> = {},
) {
  const id = (extra._id as ObjectId | undefined) ?? new ObjectId();
  // department defaults to null so the existing cases exercise the
  // organisation scope; the department cases below set it explicitly.
  return { _id: id, userId: id, name, xp, level: "beginner", orgId, department: null, ...extra };
}

beforeEach(() => {
  resetFakeDbState();
  resetFakeSessionState();
  fakeSessionState.userId = ME;
});

async function ranking(scope?: "department" | "organization") {
  const url = scope
    ? `http://localhost/api/leaderboard?scope=${scope}`
    : "http://localhost/api/leaderboard";
  const res = await GET(new NextRequest(url));
  return {
    status: res.status,
    rows: res.status === 200
      ? ((await res.json()) as { name: string; rank: number; isCurrentUser: boolean }[])
      : [],
  };
}

describe("GET /api/leaderboard", () => {
  it("refuses an unauthenticated caller", async () => {
    // This endpoint previously returned real names and scores to anyone at all.
    fakeSessionState.userId = null;
    fakeDbState.users.push(user("Morgan Ellis", 620, null));
    expect((await ranking()).status).toBe(401);
  });

  it("never returns a member of another organisation", async () => {
    fakeDbState.users.push(
      user("Me", 10, ORG_A, { _id: ME }),
      user("Colleague", 500, ORG_A),
      user("Rival Employee", 9999, ORG_B),
    );
    const { rows } = await ranking();
    expect(rows.map((r) => r.name).sort()).toEqual(["Colleague", "Me"]);
  });

  it("shows a user with no organisation the demo pool, not everyone", async () => {
    // This case used to assert that an unmarked orgId: null row appeared, which
    // is what made the board leak: every self-signup user carries orgId: null,
    // so "the standalone pool" was in fact every stranger on the deployment.
    // A fixture now has to say so.
    fakeDbState.users.push(
      user("Me", 10, null, { _id: ME }),
      user("Sample Morgan", 620, null, { isDemo: true }),
      user("Someone at a customer", 800, ORG_A),
    );
    const { rows } = await ranking();
    expect(rows.map((r) => r.name).sort()).toEqual(["Me", "Sample Morgan"]);
  });

  it("ranks by experience, highest first", async () => {
    fakeDbState.users.push(
      user("Low", 10, ORG_A, { _id: ME }),
      user("High", 900, ORG_A),
      user("Middle", 400, ORG_A),
    );
    const { rows } = await ranking();
    expect(rows.map((r) => r.name)).toEqual(["High", "Middle", "Low"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("leaves a disabled member off the ranking", async () => {
    fakeDbState.users.push(
      user("Me", 10, ORG_A, { _id: ME }),
      user("Suspended", 900, ORG_A, { status: "disabled" }),
    );
    const { rows } = await ranking();
    expect(rows.map((r) => r.name)).toEqual(["Me"]);
  });

  it("marks the caller, so the interface can highlight them", async () => {
    fakeDbState.users.push(user("Me", 10, ORG_A, { _id: ME }), user("Other", 20, ORG_A));
    const { rows } = await ranking();
    expect(rows.find((r) => r.name === "Me")!.isCurrentUser).toBe(true);
    expect(rows.find((r) => r.name === "Other")!.isCurrentUser).toBe(false);
  });

  it("returns at most twenty entries", async () => {
    fakeDbState.users.push(user("Me", 1, ORG_A, { _id: ME }));
    for (let i = 0; i < 30; i++) fakeDbState.users.push(user(`U${i}`, 100 + i, ORG_A));
    expect((await ranking()).rows).toHaveLength(20);
  });

  describe("department scoping", () => {
    it("ranks against the caller's own department by default", async () => {
      fakeDbState.users.push(
        user("Me", 10, ORG_A, { _id: ME, department: "Finance" }),
        user("Finance colleague", 300, ORG_A, { department: "Finance" }),
        user("Engineer", 900, ORG_A, { department: "Engineering" }),
      );
      const { rows } = await ranking();
      expect(rows.map((r) => r.name).sort()).toEqual(["Finance colleague", "Me"]);
    });

    it("widens to the whole organisation when asked", async () => {
      fakeDbState.users.push(
        user("Me", 10, ORG_A, { _id: ME, department: "Finance" }),
        user("Engineer", 900, ORG_A, { department: "Engineering" }),
      );
      const { rows } = await ranking("organization");
      expect(rows.map((r) => r.name).sort()).toEqual(["Engineer", "Me"]);
    });

    it("still never crosses the organisation, even asking for the wider scope", async () => {
      fakeDbState.users.push(
        user("Me", 10, ORG_A, { _id: ME, department: "Finance" }),
        user("Rival", 9999, ORG_B, { department: "Finance" }),
      );
      const { rows } = await ranking("organization");
      expect(rows.map((r) => r.name)).toEqual(["Me"]);
    });

    it("does not rank a caller without a department against everyone who lacks one", async () => {
      // Asking for department scope with no department would otherwise group the
      // caller with every unassigned employee, which is not a department.
      fakeDbState.users.push(
        user("Me", 10, ORG_A, { _id: ME, department: null }),
        user("Also unassigned", 500, ORG_A, { department: null }),
        user("Engineer", 900, ORG_A, { department: "Engineering" }),
      );
      const { rows } = await ranking("department");
      expect(rows.map((r) => r.name).sort()).toEqual(["Also unassigned", "Engineer", "Me"]);
    });

    it("ignores an unrecognised scope rather than failing the request", async () => {
      fakeDbState.users.push(user("Me", 10, ORG_A, { _id: ME, department: "Finance" }));
      const res = await GET(new NextRequest("http://localhost/api/leaderboard?scope=everyone"));
      expect(res.status).toBe(200);
    });
  });

  describe("callers with no organisation", () => {
    it("ranks against the demo fixtures and nobody else", async () => {
      fakeDbState.users.push(
        user("Me", 10, null, { _id: ME }),
        user("Demo One", 500, null, { isDemo: true }),
        user("Demo Two", 400, null, { isDemo: true }),
        // Another real person who signed up to the same deployment. orgId null
        // is not a tenant, so this name must never appear.
        user("Unrelated stranger", 900, null),
      );

      const { rows } = await ranking();

      expect(rows.map((r) => r.name).sort()).toEqual(["Demo One", "Demo Two", "Me"]);
    });

    it("does not leak a stranger even when the wider scope is requested", async () => {
      fakeDbState.users.push(
        user("Me", 10, null, { _id: ME }),
        user("Unrelated stranger", 900, null),
      );

      const { rows } = await ranking("organization");

      expect(rows.map((r) => r.name)).toEqual(["Me"]);
    });

    it("keeps demo fixtures out of a real organisation's board", async () => {
      fakeDbState.users.push(
        user("Me", 10, ORG_A, { _id: ME }),
        user("Colleague", 300, ORG_A),
        // A fixture can only have orgId null, but asserting it explicitly means
        // a future change that gives one an org cannot quietly pad a customer's
        // ranking.
        user("Demo One", 5000, ORG_A, { isDemo: true }),
      );

      const { rows } = await ranking("organization");

      expect(rows.map((r) => r.name).sort()).toEqual(["Colleague", "Me"]);
    });
  });
});