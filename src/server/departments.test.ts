import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const {
  ensureOrgDepartments,
  listOrgDepartments,
  findOrgDepartment,
  isOrgDepartment,
  normalizeDepartmentName,
  STANDARD_DEPARTMENT_NAMES,
} = await import("./departments");

const ORG = new ObjectId();
const OTHER_ORG = new ObjectId();

function seedMember(orgId: ObjectId, department: string | null) {
  fakeDbState.users.push({ _id: new ObjectId(), orgId, department } as never);
}

describe("normalizeDepartmentName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeDepartmentName("  Customer   Support  ")).toBe("Customer Support");
  });

  it("leaves an already-clean name alone", () => {
    expect(normalizeDepartmentName("Finance")).toBe("Finance");
  });

  it("returns empty for whitespace only", () => {
    expect(normalizeDepartmentName("   ")).toBe("");
  });
});

describe("ensureOrgDepartments", () => {
  beforeEach(resetFakeDbState);

  it("seeds the standard set for a new organisation", async () => {
    await ensureOrgDepartments(ORG);
    expect(fakeDbState.departments).toHaveLength(STANDARD_DEPARTMENT_NAMES.length);
  });

  it("is idempotent when called again", async () => {
    await ensureOrgDepartments(ORG);
    await ensureOrgDepartments(ORG);
    expect(fakeDbState.departments).toHaveLength(STANDARD_DEPARTMENT_NAMES.length);
  });

  it("does not duplicate when several callers seed at once", async () => {
    // The bug this replaces: read-then-insert with no uniqueness meant two
    // concurrent callers each saw an empty collection, each decided all ten
    // standard names were missing, and each inserted them. One organisation
    // ended up with every department exactly twice.
    await Promise.all(Array.from({ length: 6 }, () => ensureOrgDepartments(ORG)));
    const names = fakeDbState.departments.map((d) => String(d.name).toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("adopts a department already sitting on a member", async () => {
    // An organisation that predates the collection keeps what it was using.
    seedMember(ORG, "Field Service");
    await ensureOrgDepartments(ORG);
    const names = fakeDbState.departments.map((d) => d.name);
    expect(names).toContain("Field Service");
  });

  it("does not adopt a blank department from a member", async () => {
    seedMember(ORG, "   ");
    seedMember(ORG, null);
    await ensureOrgDepartments(ORG);
    expect(fakeDbState.departments).toHaveLength(STANDARD_DEPARTMENT_NAMES.length);
  });

  it("treats a member's differently-cased department as the one it already has", async () => {
    seedMember(ORG, "finance");
    await ensureOrgDepartments(ORG);
    const finances = fakeDbState.departments.filter(
      (d) => String(d.name).toLowerCase() === "finance",
    );
    expect(finances).toHaveLength(1);
  });

  it("keeps one organisation's departments out of another's", async () => {
    await ensureOrgDepartments(ORG);
    await ensureOrgDepartments(OTHER_ORG);
    const mine = fakeDbState.departments.filter((d) => String(d.orgId) === String(ORG));
    expect(mine).toHaveLength(STANDARD_DEPARTMENT_NAMES.length);
  });
});

describe("listOrgDepartments", () => {
  beforeEach(resetFakeDbState);

  it("seeds on first read and returns them sorted", async () => {
    const rows = await listOrgDepartments(ORG);
    expect(rows.length).toBe(STANDARD_DEPARTMENT_NAMES.length);
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("does not write on a subsequent read", async () => {
    // It used to re-derive the standard set on every call, which is a write path
    // on a read and what made the duplicate race easy to hit.
    await listOrgDepartments(ORG);
    const after = fakeDbState.departments.length;
    await listOrgDepartments(ORG);
    await listOrgDepartments(ORG);
    expect(fakeDbState.departments).toHaveLength(after);
  });

  it("never returns the same name twice, even if the collection holds duplicates", async () => {
    // Every dropdown renders from this list with the name as the option value,
    // and two options sharing a value is an ambiguous selection -- so a stale
    // row from before the unique index existed must not reach the UI.
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    fakeDbState.departments.push(
      { _id: id1, departmentId: id1, orgId: ORG, name: "Finance" } as never,
      { _id: id2, departmentId: id2, orgId: ORG, name: "finance" } as never,
    );
    const rows = await listOrgDepartments(ORG);
    expect(rows.filter((r) => r.name.toLowerCase() === "finance")).toHaveLength(1);
  });

  it("returns only this organisation's departments", async () => {
    await listOrgDepartments(ORG);
    await listOrgDepartments(OTHER_ORG);
    const rows = await listOrgDepartments(ORG);
    expect(rows.every((r) => String(r.orgId) === String(ORG))).toBe(true);
  });
});

describe("findOrgDepartment", () => {
  beforeEach(resetFakeDbState);

  it("matches regardless of case and surrounding space", async () => {
    await ensureOrgDepartments(ORG);
    expect((await findOrgDepartment(ORG, "  fInAnCe "))?.name).toBe("Finance");
  });

  it("returns null for a department the organisation does not have", async () => {
    await ensureOrgDepartments(ORG);
    expect(await findOrgDepartment(ORG, "Astrophysics")).toBeNull();
  });

  it("returns null for a blank name rather than matching anything", async () => {
    await ensureOrgDepartments(ORG);
    expect(await findOrgDepartment(ORG, "   ")).toBeNull();
  });
});

describe("isOrgDepartment", () => {
  beforeEach(resetFakeDbState);

  it("accepts a department the organisation has", async () => {
    await ensureOrgDepartments(ORG);
    expect(await isOrgDepartment(ORG, "Engineering")).toBe(true);
  });

  it("rejects one it does not, which is what guards client input", async () => {
    await ensureOrgDepartments(ORG);
    expect(await isOrgDepartment(ORG, "Not A Department")).toBe(false);
  });

  it("does not accept another organisation's custom department", async () => {
    seedMember(OTHER_ORG, "Field Service");
    await ensureOrgDepartments(OTHER_ORG);
    await ensureOrgDepartments(ORG);
    expect(await isOrgDepartment(ORG, "Field Service")).toBe(false);
  });
});
