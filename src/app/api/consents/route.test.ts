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

type Policy = {
  policy: string;
  optional: boolean;
  granted: boolean;
  needsDecision: boolean;
};

function seedMe(orgId: ObjectId | null = ORG) {
  fakeDbState.users.push({ _id: ME, orgId, name: "Me" });
  fakeSessionState.userId = ME;
}

async function policies(): Promise<Policy[]> {
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()).policies;
}

function decide(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/consents", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

describe("GET /api/consents", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedMe();
  });

  it("presents every policy with its wording and whether it can be refused", async () => {
    const rows = await policies();

    expect(rows.map((p) => p.policy).sort()).toEqual(["data_processing", "emotional_profiling"]);
    expect(rows.find((p) => p.policy === "data_processing")!.optional).toBe(false);
    expect(rows.find((p) => p.policy === "emotional_profiling")!.optional).toBe(true);
    expect(rows.every((p) => p.needsDecision)).toBe(true);
  });

  it("refuses an unauthenticated caller", async () => {
    fakeSessionState.userId = null;
    expect((await GET()).status).toBe(401);
  });
});

describe("PATCH /api/consents", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedMe();
  });

  it("records an optional policy being granted", async () => {
    const res = await decide({ policy: "emotional_profiling", granted: true });

    expect(res.status).toBe(200);
    expect((await policies()).find((p) => p.policy === "emotional_profiling")!.granted).toBe(true);
  });

  it("records an optional policy being declined", async () => {
    const res = await decide({ policy: "emotional_profiling", granted: false });

    expect(res.status).toBe(200);
    const row = (await policies()).find((p) => p.policy === "emotional_profiling")!;
    expect(row.granted).toBe(false);
    expect(row.needsDecision).toBe(false);
  });

  it("refuses to record a decline on a policy the product needs", async () => {
    // Accepting it would leave somebody with an account that silently does
    // nothing. Withdrawing that consent is account deletion, which exists and
    // says what it does.
    const res = await decide({ policy: "data_processing", granted: false });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/delete your account/i);
  });

  it("rejects an unknown policy rather than silently storing it", async () => {
    expect((await decide({ policy: "sell_my_data", granted: true })).status).toBe(400);
    expect(fakeDbState.consents).toHaveLength(0);
  });

  it("rejects a non-boolean decision", async () => {
    expect((await decide({ policy: "emotional_profiling", granted: "yes" })).status).toBe(400);
    expect((await decide({ policy: "emotional_profiling" })).status).toBe(400);
  });

  it("treats a malformed body as a client error", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/consents", { method: "PATCH", body: "{ not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("stamps the caller's organisation, and copes without one", async () => {
    await decide({ policy: "emotional_profiling", granted: true });
    expect((fakeDbState.consents[0].orgId as ObjectId).equals(ORG)).toBe(true);

    resetFakeDbState();
    resetFakeSessionState();
    seedMe(null);
    await decide({ policy: "emotional_profiling", granted: true });
    expect(fakeDbState.consents[0].orgId).toBeNull();
  });

  it("refuses an unauthenticated caller", async () => {
    fakeSessionState.userId = null;
    expect((await decide({ policy: "emotional_profiling", granted: true })).status).toBe(401);
  });
});
