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
    department: "IT",
  });
  fakeSessionState.userId = ADMIN;
}

function seedMember(name: string, department: string | null, orgId: ObjectId = ORG) {
  const id = new ObjectId();
  fakeDbState.users.push({ _id: id, orgId, role: "employee", name, status: "active", department });
  return id;
}

function create(target: string) {
  return POST(
    new NextRequest("http://localhost/api/org/training", {
      method: "POST",
      body: JSON.stringify({
        title: "Invoice fraud refresher",
        target,
        dueDate: "2026-09-01",
        requiredScenarios: 5,
      }),
    }),
  );
}

/** Who the campaign that was just created actually got assigned to. */
function assignedIds(): string[] {
  return fakeDbState.assignments.map((a) => (a.userId as ObjectId).toString()).sort();
}

describe("POST /api/org/training with a department target", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("assigns every member of the named department and nobody else", async () => {
    const a = seedMember("A", "Finance");
    const b = seedMember("B", "Finance");
    seedMember("C", "Engineering");

    const res = await create("department:Finance");

    expect(res.status).toBe(201);
    expect(assignedIds()).toEqual([a.toString(), b.toString()].sort());
  });

  it("stores the target so the campaign still reads as a department later", async () => {
    seedMember("A", "Finance");

    await create("department:Finance");

    expect(fakeDbState.campaigns[0].target).toBe("department:Finance");
  });

  it("never reaches another organization's department", async () => {
    const ours = seedMember("Ours", "Finance");
    seedMember("Theirs", "Finance", OTHER_ORG);

    const res = await create("department:Finance");

    expect(res.status).toBe(201);
    expect(assignedIds()).toEqual([ours.toString()]);
  });

  it("rejects a department outside the survey's set without creating a campaign", async () => {
    seedMember("A", "Finance");

    const res = await create("department:Ministry of Silly Walks");

    expect(res.status).toBe(400);
    expect(fakeDbState.campaigns).toHaveLength(0);
    expect(fakeDbState.assignments).toHaveLength(0);
  });

  it("refuses an empty department rather than creating a campaign nobody sees", async () => {
    seedMember("A", "Finance");

    const res = await create("department:Legal");

    // A campaign assigned to nobody looks like success and then never appears
    // in anyone's queue.
    expect(res.status).toBe(409);
    expect(fakeDbState.campaigns).toHaveLength(0);
  });

  it("still assigns the whole org", async () => {
    const a = seedMember("A", "Finance");
    const b = seedMember("B", null);

    const res = await create("all");

    expect(res.status).toBe(201);
    expect(assignedIds()).toEqual([ADMIN.toString(), a.toString(), b.toString()].sort());
  });

  it("still assigns a single member", async () => {
    const a = seedMember("A", "Finance");
    seedMember("B", "Finance");

    const res = await create(a.toString());

    expect(res.status).toBe(201);
    expect(assignedIds()).toEqual([a.toString()]);
  });

  it("refuses a non-admin caller", async () => {
    const outsider = seedMember("Outsider", "Finance");
    fakeSessionState.userId = outsider;

    const res = await create("department:Finance");

    expect(res.status).toBe(403);
    expect(fakeDbState.campaigns).toHaveLength(0);
  });
});
