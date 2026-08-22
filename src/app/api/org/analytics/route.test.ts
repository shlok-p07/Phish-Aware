import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";

await installMongoMock();
await installSessionMock();

const { GET } = await import("./route");

const ORG = new ObjectId();
const OTHER_ORG = new ObjectId();
const ADMIN = new ObjectId();

type Row = { department: string | null; memberCount: number; avgAccuracy: number; atRisk: number };

function seedAdmin() {
  fakeDbState.users.push({
    _id: ADMIN,
    orgId: ORG,
    role: "admin",
    name: "Admin",
    status: "disabled", // kept out of the averages so the fixtures stay readable
    department: "IT",
  });
  fakeSessionState.userId = ADMIN;
}

/** A member with `correct` of `total` attempts graded correct. */
function seedMember(
  name: string,
  department: string | null,
  correct: number,
  total: number,
  orgId: ObjectId = ORG,
) {
  const id = new ObjectId();
  fakeDbState.users.push({ _id: id, orgId, role: "employee", name, status: "active", department });
  for (let i = 0; i < total; i++) {
    fakeDbState.attempts.push({ _id: new ObjectId(), userId: id, correct: i < correct });
  }
  return id;
}

async function analytics(): Promise<{ perDepartment: Row[]; activeCount: number }> {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/org/analytics department breakdown", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("averages accuracy within each department", async () => {
    seedMember("A", "Finance", 8, 10); // 80%
    seedMember("B", "Finance", 6, 10); // 60%
    seedMember("C", "Engineering", 9, 10); // 90%

    const { perDepartment } = await analytics();

    expect(perDepartment).toEqual([
      { department: "Finance", memberCount: 2, avgAccuracy: 70, atRisk: 0 },
      { department: "Engineering", memberCount: 1, avgAccuracy: 90, atRisk: 0 },
    ]);
  });

  it("puts the worst department first, since that is where to intervene", async () => {
    seedMember("A", "Engineering", 10, 10);
    seedMember("B", "Finance", 2, 10);
    seedMember("C", "Legal", 6, 10);

    const { perDepartment } = await analytics();

    expect(perDepartment.map((d) => d.department)).toEqual(["Finance", "Legal", "Engineering"]);
  });

  it("keeps unassigned members as their own group rather than dropping them", async () => {
    seedMember("A", "Finance", 8, 10);
    seedMember("B", null, 4, 10);

    const { perDepartment, activeCount } = await analytics();

    const unassigned = perDepartment.find((d) => d.department === null);
    expect(unassigned).toEqual({
      department: null,
      memberCount: 1,
      avgAccuracy: 40,
      atRisk: 1,
    });
    // The counts still reconcile with the org-wide total.
    expect(perDepartment.reduce((sum, d) => sum + d.memberCount, 0)).toBe(activeCount);
  });

  it("counts at-risk members per department", async () => {
    seedMember("A", "Finance", 2, 10);
    seedMember("B", "Finance", 3, 10);
    seedMember("C", "Finance", 10, 10);

    const { perDepartment } = await analytics();

    expect(perDepartment[0]).toMatchObject({ department: "Finance", memberCount: 3, atRisk: 2 });
  });

  it("never counts another organization's departments", async () => {
    seedMember("Ours", "Finance", 8, 10);
    seedMember("Theirs", "Finance", 0, 10, OTHER_ORG);

    const { perDepartment } = await analytics();

    expect(perDepartment).toEqual([
      { department: "Finance", memberCount: 1, avgAccuracy: 80, atRisk: 0 },
    ]);
  });

  it("returns an empty breakdown for an org with no active members", async () => {
    const { perDepartment } = await analytics();

    expect(perDepartment).toEqual([]);
  });
});

describe("GET /api/org/analytics number shape", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("emits whole numbers, as the contract declares", async () => {
    // computeMemberStats keeps two decimals so risk banding is not skewed by
    // rounding, but the contract says integer -- emitting 66.67 into an
    // integer-typed field silently lies to every generated client.
    seedMember("A", "Finance", 2, 3);

    const res = await GET();
    const body = (await res.json()) as {
      avgAccuracy: number;
      perMember: { accuracy: number }[];
      perDepartment: { avgAccuracy: number }[];
    };

    expect(Number.isInteger(body.avgAccuracy)).toBe(true);
    expect(body.perMember.every((m) => Number.isInteger(m.accuracy))).toBe(true);
    expect(body.perDepartment.every((d) => Number.isInteger(d.avgAccuracy))).toBe(true);
  });

  it("rounds a member's accuracy to the nearest whole number", async () => {
    seedMember("A", "Finance", 2, 3);

    const body = (await (await GET()).json()) as { perMember: { accuracy: number }[] };

    expect(body.perMember[0].accuracy).toBe(67);
  });
});
