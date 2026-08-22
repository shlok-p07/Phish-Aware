import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";
import { DEPARTMENTS } from "@/lib/onboarding-survey";

await installMongoMock();
await installSessionMock();

const { GET, POST } = await import("./route");

const ORG = new ObjectId();
const OTHER_ORG = new ObjectId();
const ADMIN = new ObjectId();

type Row = { id: string; name: string; memberCount: number };

function seedAdmin(orgId: ObjectId = ORG) {
  fakeDbState.users.push({ _id: ADMIN, orgId, role: "admin", name: "Admin", department: null });
  fakeSessionState.userId = ADMIN;
}

function seedMember(department: string | null, orgId: ObjectId = ORG) {
  const id = new ObjectId();
  fakeDbState.users.push({ _id: id, orgId, role: "employee", name: "M", department });
  return id;
}

async function list(): Promise<Row[]> {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

function create(name: unknown) {
  return POST(
    new NextRequest("http://localhost/api/org/departments", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  );
}

describe("GET /api/org/departments", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("gives a new organization the standard set", async () => {
    const names = (await list()).map((d) => d.name);

    // The ten shipped names are what map to attack types, so a customer who
    // keeps them gets department-targeted scenarios without configuring anything.
    expect(names).toEqual([...DEPARTMENTS].sort());
  });

  it("is idempotent -- asking twice does not duplicate anything", async () => {
    await list();
    const second = await list();

    expect(second).toHaveLength(DEPARTMENTS.length);
    expect(fakeDbState.departments).toHaveLength(DEPARTMENTS.length);
  });

  it("adopts a department an existing member already had", async () => {
    // An organization that predates this collection keeps the departments it was
    // already using, rather than losing them to a fixed list.
    seedMember("Claims Processing");

    expect((await list()).map((d) => d.name)).toContain("Claims Processing");
  });

  it("counts members in each department", async () => {
    seedMember("Finance");
    seedMember("Finance");
    seedMember("Legal");

    const rows = await list();

    expect(rows.find((d) => d.name === "Finance")?.memberCount).toBe(2);
    expect(rows.find((d) => d.name === "Legal")?.memberCount).toBe(1);
    expect(rows.find((d) => d.name === "IT")?.memberCount).toBe(0);
  });

  it("never counts another organization's members", async () => {
    seedMember("Finance", OTHER_ORG);

    expect((await list()).find((d) => d.name === "Finance")?.memberCount).toBe(0);
  });

  it("refuses a non-admin caller", async () => {
    fakeSessionState.userId = seedMember(null);

    expect((await GET()).status).toBe(403);
  });
});

describe("POST /api/org/departments", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("adds a department the product never shipped with", async () => {
    const res = await create("Claims Processing");

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: expect.any(String),
      name: "Claims Processing",
      memberCount: 0,
    });
  });

  it("trims and collapses whitespace in the name", async () => {
    const res = await create("  Claims   Processing  ");

    expect((await res.json()).name).toBe("Claims Processing");
  });

  it("refuses a duplicate regardless of case", async () => {
    await create("Claims Processing");

    const res = await create("claims processing");

    // Two departments that read as one is worse than a rejected request.
    expect(res.status).toBe(409);
  });

  it("refuses a name that clashes with a standard department", async () => {
    expect((await create("finance")).status).toBe(409);
  });

  it("refuses an empty or whitespace-only name", async () => {
    expect((await create("")).status).toBe(400);
    expect((await create("   ")).status).toBe(400);
  });

  it("refuses an over-long name", async () => {
    expect((await create("x".repeat(61))).status).toBe(400);
  });

  it("refuses a non-admin caller", async () => {
    fakeSessionState.userId = seedMember(null);

    expect((await create("Claims Processing")).status).toBe(403);
  });

  it("keeps departments inside the organization that created them", async () => {
    await create("Claims Processing");

    expect(fakeDbState.departments.every((d) => (d.orgId as ObjectId).equals(ORG))).toBe(true);
  });
});
