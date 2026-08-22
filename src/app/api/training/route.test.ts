import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { GET } = await import("./route");

const ORG = new ObjectId();
// Attempts always reference a scenario; a focused campaign is judged against it.
const SCENARIO = new ObjectId();
const ME = new ObjectId();

type Row = {
  id: string;
  title: string;
  dueDate: string | null;
  requiredScenarios: number;
  focusLabel: string;
  completedScenarios: number;
  completedLessons: number;
  requiredLessons: number;
  status: string;
};

function campaign(name: string, requiredScenarios: number, dueDate: Date | null) {
  const id = new ObjectId();
  fakeDbState.campaigns.push({
    _id: id,
    campaignId: id,
    orgId: ORG,
    name,
    requiredScenarios,
    dueDate,
  });
  return id;
}

function seedMe(orgId: ObjectId | null = ORG) {
  fakeDbState.users.push({ _id: ME, orgId, name: "Me" });
}

function assign(
  campaignId: ObjectId,
  userId: ObjectId,
  createdAt = new Date(Date.now() - 60_000),
  orgId: ObjectId = ORG,
) {
  const id = new ObjectId();
  fakeDbState.assignments.push({
    _id: id,
    assignmentId: id,
    campaignId,
    userId,
    orgId,
    status: "assigned",
    progress: 0,
    completedAt: null,
    createdAt,
  });
  return id;
}

function attempt(userId: ObjectId, createdAt: Date) {
  fakeDbState.attempts.push({
    _id: new ObjectId(),
    userId,
    scenarioId: SCENARIO,
    correct: true,
    createdAt,
  });
}

async function rows(): Promise<Row[]> {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/training", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    fakeSessionState.userId = ME;
    seedMe();
  });

  it("shows an assignment the admin made, which was previously invisible", async () => {
    const c = campaign("Invoice fraud", 5, new Date("2026-10-01"));
    assign(c, ME);

    expect(await rows()).toEqual([
      {
        id: expect.any(String),
        title: "Invoice fraud",
        dueDate: "2026-10-01",
        requiredScenarios: 5,
        // Wording shared with the admin view, so both describe the requirement
        // the same way.
        focusLabel: "Any practice counts",
        completedScenarios: 0,
        // This campaign assigns no reading, so both are zero.
        completedLessons: 0,
        requiredLessons: 0,
        status: "assigned",
      },
    ]);
  });

  it("counts only practice done since the assignment was made", async () => {
    const assignedAt = new Date(Date.now() - 60_000);
    const c = campaign("Invoice fraud", 5, null);
    assign(c, ME, assignedAt);
    attempt(ME, new Date(assignedAt.getTime() - 10_000)); // earlier practice
    attempt(ME, new Date(assignedAt.getTime() + 10_000));
    attempt(ME, new Date(assignedAt.getTime() + 20_000));

    const [row] = await rows();

    // Crediting practice from before the assignment would let an active learner
    // complete a brand-new requirement without doing anything.
    expect(row.completedScenarios).toBe(2);
    expect(row.status).toBe("in_progress");
  });

  it("marks it completed once the requirement is met", async () => {
    const assignedAt = new Date(Date.now() - 60_000);
    const c = campaign("Invoice fraud", 2, new Date("2020-01-01"));
    assign(c, ME, assignedAt);
    attempt(ME, new Date(assignedAt.getTime() + 1000));
    attempt(ME, new Date(assignedAt.getTime() + 2000));

    const [row] = await rows();

    // Finished beats overdue: a past deadline on completed work is not a debt.
    expect(row.status).toBe("completed");
    expect(row.completedScenarios).toBe(2);
  });

  it("caps the count at what was asked for", async () => {
    const assignedAt = new Date(Date.now() - 60_000);
    const c = campaign("Invoice fraud", 2, null);
    assign(c, ME, assignedAt);
    for (let i = 0; i < 9; i++) attempt(ME, new Date(assignedAt.getTime() + i * 1000));

    expect((await rows())[0].completedScenarios).toBe(2);
  });

  it("flags an unmet assignment past its deadline as overdue", async () => {
    const c = campaign("Invoice fraud", 3, new Date("2020-01-01"));
    assign(c, ME);

    expect((await rows())[0].status).toBe("overdue");
  });

  it("orders by deadline, with undated work last", async () => {
    assign(campaign("Later", 1, new Date("2026-12-01")), ME);
    assign(campaign("No deadline", 1, null), ME);
    assign(campaign("Sooner", 1, new Date("2026-09-01")), ME);

    expect((await rows()).map((r) => r.title)).toEqual(["Sooner", "Later", "No deadline"]);
  });

  it("never shows another employee's assignments", async () => {
    const someoneElse = new ObjectId();
    assign(campaign("Mine", 1, null), ME);
    assign(campaign("Theirs", 1, null), someoneElse);

    expect((await rows()).map((r) => r.title)).toEqual(["Mine"]);
  });

  it("skips an assignment whose campaign was deleted", async () => {
    assign(new ObjectId(), ME);

    // Rendering a nameless obligation is worse than not rendering it.
    expect(await rows()).toEqual([]);
  });

  it("returns an empty list when nothing is assigned", async () => {
    expect(await rows()).toEqual([]);
  });

  it("refuses an unauthenticated caller", async () => {
    fakeSessionState.userId = null;

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("stops showing an ex-employer's training once the member is removed", async () => {
    // Removing a member sets orgId to null and keeps their history, but leaves
    // their assignment rows behind. Filtering on userId alone meant a former
    // employee kept seeing mandatory training from a company they had left.
    fakeDbState.users = [];
    seedMe(null);
    assign(campaign("Former employer's module", 1, null), ME);

    expect(await rows()).toEqual([]);
  });

  it("does not show an assignment made by a different organization", async () => {
    const otherOrg = new ObjectId();
    assign(campaign("Ours", 1, null), ME);
    assign(campaign("Theirs", 1, null), ME, new Date(Date.now() - 60_000), otherOrg);

    expect((await rows()).map((r) => r.title)).toEqual(["Ours"]);
  });
});