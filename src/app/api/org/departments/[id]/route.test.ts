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
  fakeDbState.users.push({ _id: ADMIN, orgId: ORG, role: "admin", name: "Admin", department: null });
  fakeSessionState.userId = ADMIN;
}

function seedDepartment(name: string, orgId: ObjectId = ORG) {
  const id = new ObjectId();
  fakeDbState.departments.push({
    _id: id,
    departmentId: id,
    orgId,
    name,
    parentId: null,
    managerId: null,
  });
  return id;
}

function seedMember(department: string | null, orgId: ObjectId = ORG) {
  const id = new ObjectId();
  fakeDbState.users.push({ _id: id, orgId, role: "employee", name: "M", department });
  return id;
}

const member = (id: ObjectId) => fakeDbState.users.find((u) => u._id === id);

function rename(id: ObjectId, name: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/org/departments/${id.toString()}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
    { params: Promise.resolve({ id: id.toString() }) },
  );
}

function remove(id: ObjectId) {
  return DELETE(
    new NextRequest(`http://localhost/api/org/departments/${id.toString()}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: id.toString() }) },
  );
}

describe("PATCH /api/org/departments/[id]", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("renames the department and carries its members across", async () => {
    const id = seedDepartment("Finance");
    const inIt = seedMember("Finance");
    const elsewhere = seedMember("Legal");

    const res = await rename(id, "Finance & Treasury");

    expect(res.status).toBe(200);
    // The name is denormalized onto members for the practice path, so a rename
    // that did not carry them would leave them pointing at nothing.
    expect(member(inIt)?.department).toBe("Finance & Treasury");
    expect(member(elsewhere)?.department).toBe("Legal");
  });

  it("records the departmentId on members it moves", async () => {
    const id = seedDepartment("Finance");
    const inIt = seedMember("Finance");

    await rename(id, "Treasury");

    expect((member(inIt)?.departmentId as ObjectId).equals(id)).toBe(true);
  });

  it("refuses a name another department already has", async () => {
    const id = seedDepartment("Finance");
    seedDepartment("Legal");

    expect((await rename(id, "legal")).status).toBe(409);
  });

  it("allows renaming to a different case of its own name", async () => {
    const id = seedDepartment("finance");

    expect((await rename(id, "Finance")).status).toBe(200);
  });

  it("refuses an empty name", async () => {
    const id = seedDepartment("Finance");

    expect((await rename(id, "  ")).status).toBe(400);
    expect(fakeDbState.departments[0].name).toBe("Finance");
  });

  it("cannot rename another organization's department", async () => {
    const id = seedDepartment("Finance", OTHER_ORG);

    expect((await rename(id, "Hijacked")).status).toBe(404);
    expect(fakeDbState.departments[0].name).toBe("Finance");
  });

  it("refuses a non-admin caller", async () => {
    const id = seedDepartment("Finance");
    fakeSessionState.userId = seedMember(null);

    expect((await rename(id, "Nope")).status).toBe(403);
  });
});

describe("DELETE /api/org/departments/[id]", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("unassigns its members rather than deleting them", async () => {
    const id = seedDepartment("Finance");
    const inIt = seedMember("Finance");

    const res = await remove(id);

    expect(res.status).toBe(204);
    // Removing a department is an org-structure change, not a reason to lose
    // people or their history.
    expect(member(inIt)).toBeDefined();
    expect(member(inIt)?.department).toBeNull();
    expect(member(inIt)?.departmentId).toBeNull();
    expect(fakeDbState.departments).toHaveLength(0);
  });

  it("leaves members of other departments alone", async () => {
    const id = seedDepartment("Finance");
    seedDepartment("Legal");
    const other = seedMember("Legal");

    await remove(id);

    expect(member(other)?.department).toBe("Legal");
  });

  it("cannot delete another organization's department", async () => {
    const id = seedDepartment("Finance", OTHER_ORG);
    const theirs = seedMember("Finance", OTHER_ORG);

    expect((await remove(id)).status).toBe(404);
    expect(fakeDbState.departments).toHaveLength(1);
    expect(member(theirs)?.department).toBe("Finance");
  });

  it("refuses a non-admin caller", async () => {
    const id = seedDepartment("Finance");
    fakeSessionState.userId = seedMember(null);

    expect((await remove(id)).status).toBe(403);
    expect(fakeDbState.departments).toHaveLength(1);
  });

  it("rejects a malformed id", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/org/departments/nope", { method: "DELETE" }),
      { params: Promise.resolve({ id: "nope" }) },
    );

    expect(res.status).toBe(400);
  });
});
