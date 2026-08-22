import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { PATCH, DELETE } = await import("./route");

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

function seedMember(overrides: Record<string, unknown> = {}) {
  const id = new ObjectId();
  fakeDbState.users.push({
    _id: id,
    orgId: ORG,
    role: "employee",
    name: "Member",
    department: "Finance",
    ...overrides,
  });
  return id;
}

function patch(id: ObjectId, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/org/members/${id.toString()}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: id.toString() }) },
  );
}

describe("PATCH /api/org/members/[id]", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("moves a member to a different department", async () => {
    const id = seedMember({ department: "Finance" });

    const res = await patch(id, { department: "Engineering" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ department: "Engineering" });
    expect(fakeDbState.users.find((u) => u._id === id)?.department).toBe("Engineering");
  });

  it("unassigns a department when sent null", async () => {
    const id = seedMember({ department: "Finance" });

    const res = await patch(id, { department: null });

    expect(res.status).toBe(200);
    expect(fakeDbState.users.find((u) => u._id === id)?.department).toBeNull();
  });

  it("rejects a department outside the survey's enum", async () => {
    const id = seedMember({ department: "Finance" });

    const res = await patch(id, { department: "Ministry of Silly Walks" });

    expect(res.status).toBe(400);
    // Rejected rather than stored: an unrecognized department breaks the
    // department -> attack-type mapping and isolates the member on the board.
    expect(fakeDbState.users.find((u) => u._id === id)?.department).toBe("Finance");
  });

  it("changes a role without disturbing the department", async () => {
    const id = seedMember({ department: "Finance" });

    const res = await patch(id, { role: "admin" });

    expect(res.status).toBe(200);
    const member = fakeDbState.users.find((u) => u._id === id);
    expect(member?.role).toBe("admin");
    expect(member?.department).toBe("Finance");
  });

  it("changes a department without disturbing the role", async () => {
    const id = seedMember({ role: "admin", department: "Finance" });

    const res = await patch(id, { department: "Legal" });

    expect(res.status).toBe(200);
    const member = fakeDbState.users.find((u) => u._id === id);
    expect(member?.role).toBe("admin");
    expect(member?.department).toBe("Legal");
  });

  it("cannot reach a member of another organization", async () => {
    const id = seedMember({ orgId: OTHER_ORG, department: "Finance" });

    const res = await patch(id, { department: "Executive" });

    expect(res.status).toBe(404);
    expect(fakeDbState.users.find((u) => u._id === id)?.department).toBe("Finance");
  });

  it("refuses a non-admin caller", async () => {
    const id = seedMember();
    const outsider = seedMember({ role: "employee" });
    fakeSessionState.userId = outsider;

    const res = await patch(id, { department: "Executive" });

    expect(res.status).toBe(403);
  });

  it("still blocks demoting the only admin", async () => {
    const res = await patch(ADMIN, { role: "employee" });

    expect(res.status).toBe(409);
    expect(fakeDbState.users.find((u) => u._id === ADMIN)?.role).toBe("admin");
  });

  it("rejects an empty update rather than writing nothing", async () => {
    const id = seedMember();

    const res = await patch(id, {});

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/org/members/[id]", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  function remove(id: ObjectId) {
    return DELETE(
      new NextRequest(`http://localhost/api/org/members/${id.toString()}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: id.toString() }) },
    );
  }

  function seedAssignment(userId: ObjectId, orgId: ObjectId = ORG) {
    fakeDbState.assignments.push({
      _id: new ObjectId(),
      userId,
      campaignId: new ObjectId(),
      orgId,
      status: "assigned",
    });
  }

  it("takes the member out of the org without deleting their account", async () => {
    const id = seedMember({ department: "Finance" });

    const res = await remove(id);

    expect(res.status).toBe(204);
    const member = fakeDbState.users.find((u) => u._id === id);
    // Their practice history is deliberately kept; only the membership goes.
    expect(member).toBeDefined();
    expect(member?.orgId).toBeNull();
    expect(member?.department).toBeNull();
  });

  it("removes their training assignments for that org", async () => {
    const id = seedMember();
    seedAssignment(id);

    await remove(id);

    // An assignment is an obligation to this organization and does not survive
    // leaving it; left behind it orphans and still counts in org totals.
    expect(fakeDbState.assignments).toHaveLength(0);
  });

  it("leaves assignments belonging to other organizations alone", async () => {
    const id = seedMember();
    const elsewhere = new ObjectId();
    seedAssignment(id, elsewhere);

    await remove(id);

    expect(fakeDbState.assignments).toHaveLength(1);
  });

  it("does not touch another member's assignments", async () => {
    const id = seedMember();
    const other = seedMember();
    seedAssignment(other);

    await remove(id);

    expect(fakeDbState.assignments).toHaveLength(1);
  });

  it("cannot remove a member of another organization", async () => {
    const id = seedMember({ orgId: OTHER_ORG });
    seedAssignment(id, OTHER_ORG);

    const res = await remove(id);

    expect(res.status).toBe(404);
    expect(fakeDbState.assignments).toHaveLength(1);
  });

  it("still refuses to remove the only admin", async () => {
    const res = await remove(ADMIN);

    expect(res.status).toBe(409);
    expect(fakeDbState.users.find((u) => u._id === ADMIN)?.orgId).toEqual(ORG);
  });

  it("refuses a non-admin caller", async () => {
    const id = seedMember();
    const outsider = seedMember();
    fakeSessionState.userId = outsider;

    const res = await remove(id);

    expect(res.status).toBe(403);
  });
});
