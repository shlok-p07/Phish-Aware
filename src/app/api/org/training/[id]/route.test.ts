import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { GET } = await import("./route");

const ORG = new ObjectId();
// Attempts always reference a scenario; a focused campaign is judged against it.
const SCENARIO = new ObjectId();
const OTHER_ORG = new ObjectId();
const ADMIN = new ObjectId();

type Detail = {
  id: string;
  title: string;
  requiredScenarios: number;
  members: { id: string; name: string; department: string | null; completedScenarios: number; status: string }[];
};

function seedAdmin() {
  fakeDbState.users.push({ _id: ADMIN, orgId: ORG, role: "admin", name: "Admin", department: null });
  fakeSessionState.userId = ADMIN;
}

function seedCampaign(required = 2, dueDate: Date | null = null, orgId = ORG) {
  const id = new ObjectId();
  fakeDbState.campaigns.push({
    _id: id,
    campaignId: id,
    orgId,
    name: "Invoice fraud",
    target: "department:Finance",
    requiredScenarios: required,
    dueDate,
  });
  return id;
}

function seedMemberOn(campaignId: ObjectId, name: string, department: string | null, orgId = ORG) {
  const id = new ObjectId();
  fakeDbState.users.push({ _id: id, orgId, role: "employee", name, department });
  const aid = new ObjectId();
  fakeDbState.assignments.push({
    _id: aid,
    assignmentId: aid,
    campaignId,
    userId: id,
    orgId,
    status: "assigned",
    progress: 0,
    completedAt: null,
    createdAt: new Date(Date.now() - 86_400_000),
  });
  return id;
}

function seedAttempts(userId: ObjectId, count: number) {
  for (let i = 0; i < count; i++) {
    fakeDbState.attempts.push({
      _id: new ObjectId(),
      userId,
      scenarioId: SCENARIO,
      correct: true,
      createdAt: new Date(Date.now() - 1000 * (i + 1)),
    });
  }
}

async function detail(id: ObjectId): Promise<Detail> {
  const res = await GET(
    new NextRequest(`http://localhost/api/org/training/${id.toString()}`),
    { params: Promise.resolve({ id: id.toString() }) },
  );
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/org/training/[id]", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("shows who was assigned and how far each has got", async () => {
    const campaign = seedCampaign(2);
    const done = seedMemberOn(campaign, "Finished", "Finance");
    const partial = seedMemberOn(campaign, "Halfway", "Finance");
    seedMemberOn(campaign, "Untouched", "Finance");
    seedAttempts(done, 2);
    seedAttempts(partial, 1);

    const body = await detail(campaign);

    // An admin could create mandatory training and had no way to see this.
    expect(body.members.map((m) => [m.name, m.status, m.completedScenarios])).toEqual(
      expect.arrayContaining([
        ["Finished", "completed", 2],
        ["Halfway", "in_progress", 1],
        ["Untouched", "assigned", 0],
      ]),
    );
  });

  it("puts the people still to chase first and the finished last", async () => {
    const campaign = seedCampaign(1, new Date("2020-01-01"));
    const done = seedMemberOn(campaign, "Finished", "Finance");
    seedMemberOn(campaign, "Overdue", "Finance");
    seedAttempts(done, 1);

    const body = await detail(campaign);

    expect(body.members.map((m) => m.name)).toEqual(["Overdue", "Finished"]);
  });

  it("reports each member's department, so a gap can be traced to a team", async () => {
    const campaign = seedCampaign(1);
    seedMemberOn(campaign, "A", "Finance");

    expect((await detail(campaign)).members[0].department).toBe("Finance");
  });

  it("skips an assignment whose account is gone", async () => {
    const campaign = seedCampaign(1);
    const aid = new ObjectId();
    fakeDbState.assignments.push({
      _id: aid,
      assignmentId: aid,
      campaignId: campaign,
      userId: new ObjectId(),
      orgId: ORG,
      status: "assigned",
      createdAt: new Date(),
    });

    // A nameless row reads as an outstanding obligation nobody can act on.
    expect((await detail(campaign)).members).toEqual([]);
  });

  it("cannot read another organization's campaign", async () => {
    const campaign = seedCampaign(1, null, OTHER_ORG);
    seedMemberOn(campaign, "Theirs", "Finance", OTHER_ORG);

    const res = await GET(
      new NextRequest(`http://localhost/api/org/training/${campaign.toString()}`),
      { params: Promise.resolve({ id: campaign.toString() }) },
    );

    expect(res.status).toBe(404);
  });

  it("refuses a non-admin caller", async () => {
    const campaign = seedCampaign(1);
    const employee = seedMemberOn(campaign, "Employee", "Finance");
    fakeSessionState.userId = employee;

    const res = await GET(
      new NextRequest(`http://localhost/api/org/training/${campaign.toString()}`),
      { params: Promise.resolve({ id: campaign.toString() }) },
    );

    expect(res.status).toBe(403);
  });

  it("rejects a malformed id", async () => {
    const res = await GET(new NextRequest("http://localhost/api/org/training/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns an empty member list for a campaign nobody is on", async () => {
    const campaign = seedCampaign(1);

    expect((await detail(campaign)).members).toEqual([]);
  });
});
