import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { GET } = await import("./route");

const ORG = new ObjectId();
const OTHER_ORG = new ObjectId();
const ADMIN = new ObjectId();
const SCENARIO = new ObjectId();

type Detail = {
  name: string;
  department: string | null;
  accuracy: number;
  risk: string;
  calibrationScore: number;
  totalAttempts: number;
  cueAccuracy: { cueId: string; rate: number }[];
  vectorAccuracy: { vector: string; rate: number }[];
  assignments: { title: string; status: string; completedScenarios: number }[];
};

function seedAdmin() {
  fakeDbState.users.push({ _id: ADMIN, orgId: ORG, role: "admin", name: "Admin", department: null });
  fakeSessionState.userId = ADMIN;
  fakeDbState.scenarios.push({ _id: SCENARIO, scenarioId: SCENARIO, vector: "email" });
}

function seedMember(orgId: ObjectId = ORG) {
  const id = new ObjectId();
  fakeDbState.users.push({
    _id: id,
    orgId,
    role: "employee",
    name: "Dana",
    email: "dana@acme.test",
    status: "active",
    department: "Finance",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    lastLoginAt: new Date("2026-08-01T00:00:00Z"),
  });
  return id;
}

function seedAttempt(userId: ObjectId, correct: boolean, confidence = 50, cues: { caught?: string[]; missed?: string[] } = {}) {
  fakeDbState.attempts.push({
    _id: new ObjectId(),
    userId,
    scenarioId: SCENARIO,
    correct,
    confidence,
    caughtCues: cues.caught ?? [],
    missedCues: cues.missed ?? [],
    createdAt: new Date("2026-08-05T00:00:00Z"),
  });
}

async function detail(id: ObjectId): Promise<Detail> {
  const res = await GET(new NextRequest(`http://localhost/x/${id.toString()}/detail`), {
    params: Promise.resolve({ id: id.toString() }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/org/members/[id]/detail", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("reports identity, department and accuracy", async () => {
    const id = seedMember();
    seedAttempt(id, true);
    seedAttempt(id, false);

    const body = await detail(id);

    expect(body.name).toBe("Dana");
    expect(body.department).toBe("Finance");
    expect(body.accuracy).toBe(50);
    expect(body.totalAttempts).toBe(2);
  });

  it("ranks the cues they miss most first", async () => {
    const id = seedMember();
    seedAttempt(id, true, 50, { caught: ["urgency_language"] });
    seedAttempt(id, false, 50, { missed: ["sender_domain"] });

    // The view exists to answer "what do I do about this person", and the answer
    // is at the weak end.
    expect((await detail(id)).cueAccuracy[0]!.cueId).toBe("sender_domain");
  });

  it("surfaces somebody confidently wrong through calibration", async () => {
    const id = seedMember();
    seedAttempt(id, false, 100);
    seedAttempt(id, false, 100);

    const body = await detail(id);

    expect(body.calibrationScore).toBe(0);
    expect(body.risk).toBe("high");
  });

  it("treats a member with no history as unproven rather than safe", async () => {
    const id = seedMember();

    const body = await detail(id);

    expect(body.totalAttempts).toBe(0);
    expect(body.risk).toBe("high");
  });

  it("lists their outstanding training with progress", async () => {
    const id = seedMember();
    const campaignId = new ObjectId();
    fakeDbState.campaigns.push({
      _id: campaignId,
      campaignId,
      orgId: ORG,
      name: "Invoice fraud",
      requiredScenarios: 2,
      dueDate: null,
    });
    const aid = new ObjectId();
    fakeDbState.assignments.push({
      _id: aid,
      assignmentId: aid,
      campaignId,
      userId: id,
      orgId: ORG,
      status: "assigned",
      createdAt: new Date("2026-08-01T00:00:00Z"),
    });
    seedAttempt(id, true);

    expect((await detail(id)).assignments).toEqual([
      expect.objectContaining({ title: "Invoice fraud", completedScenarios: 1, status: "in_progress" }),
    ]);
  });

  it("does not show an assignment from a different organization", async () => {
    const id = seedMember();
    const campaignId = new ObjectId();
    fakeDbState.campaigns.push({
      _id: campaignId,
      campaignId,
      orgId: OTHER_ORG,
      name: "Former employer",
      requiredScenarios: 1,
      dueDate: null,
    });
    const aid = new ObjectId();
    fakeDbState.assignments.push({
      _id: aid,
      assignmentId: aid,
      campaignId,
      userId: id,
      orgId: OTHER_ORG,
      status: "assigned",
      createdAt: new Date(),
    });

    expect((await detail(id)).assignments).toEqual([]);
  });

  it("cannot read a member of another organization", async () => {
    const id = seedMember(OTHER_ORG);

    const res = await GET(new NextRequest(`http://localhost/x/${id.toString()}/detail`), {
      params: Promise.resolve({ id: id.toString() }),
    });

    expect(res.status).toBe(404);
  });

  it("refuses a non-admin caller", async () => {
    const id = seedMember();
    const employee = seedMember();
    fakeSessionState.userId = employee;

    const res = await GET(new NextRequest(`http://localhost/x/${id.toString()}/detail`), {
      params: Promise.resolve({ id: id.toString() }),
    });

    expect(res.status).toBe(403);
  });

  it("rejects a malformed id", async () => {
    const res = await GET(new NextRequest("http://localhost/x/nope/detail"), {
      params: Promise.resolve({ id: "nope" }),
    });

    expect(res.status).toBe(400);
  });
});
