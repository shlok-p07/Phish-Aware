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

type Entry = { action: string; actor: string; targetId: string | null; at: string };

function seedAdmin() {
  fakeDbState.users.push({ _id: ADMIN, orgId: ORG, role: "admin", name: "Ada Admin" });
  fakeSessionState.userId = ADMIN;
}

function seedEntry(
  action: string,
  at: string,
  { orgId = ORG, actorId = ADMIN }: { orgId?: ObjectId; actorId?: ObjectId } = {},
) {
  const id = new ObjectId();
  fakeDbState.auditLogs.push({
    _id: id,
    auditLogId: id,
    orgId,
    actorId,
    action,
    targetType: "user",
    targetId: null,
    metadata: {},
    ip: "",
    createdAt: new Date(at),
  });
}

async function entries(query = ""): Promise<Entry[]> {
  const res = await GET(new NextRequest(`http://localhost/api/org/audit${query}`));
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/org/audit", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    seedAdmin();
  });

  it("returns entries newest first, naming the actor", async () => {
    seedEntry("member.invited", "2026-08-01T00:00:00Z");
    seedEntry("member.removed", "2026-08-03T00:00:00Z");

    const rows = await entries();

    expect(rows.map((r) => r.action)).toEqual(["member.removed", "member.invited"]);
    expect(rows[0]!.actor).toBe("Ada Admin");
  });

  it("never shows another organization's entries", async () => {
    seedEntry("member.removed", "2026-08-01T00:00:00Z", { orgId: OTHER_ORG });

    expect(await entries()).toEqual([]);
  });

  it("keeps an entry whose actor has since left", async () => {
    seedEntry("member.role_changed", "2026-08-01T00:00:00Z", { actorId: new ObjectId() });

    // The point of an audit log is that it outlives the account.
    expect((await entries())[0]!.actor).toBe("Former member");
  });

  it("does not name an actor from outside the organization", async () => {
    const outsider = new ObjectId();
    fakeDbState.users.push({ _id: outsider, orgId: OTHER_ORG, role: "admin", name: "Someone Else" });
    seedEntry("member.removed", "2026-08-01T00:00:00Z", { actorId: outsider });

    // A leak here would be in the one place that exists to be reviewed.
    expect((await entries())[0]!.actor).toBe("Former member");
  });

  it("honours a limit and caps it", async () => {
    for (let i = 0; i < 5; i++) seedEntry("member.invited", `2026-08-0${i + 1}T00:00:00Z`);

    expect(await entries("?limit=2")).toHaveLength(2);
    expect(await entries("?limit=9999")).toHaveLength(5);
  });

  it("ignores a nonsense limit rather than failing", async () => {
    seedEntry("member.invited", "2026-08-01T00:00:00Z");

    expect(await entries("?limit=abc")).toHaveLength(1);
    expect(await entries("?limit=-4")).toHaveLength(1);
  });

  it("refuses a non-admin caller", async () => {
    const employee = new ObjectId();
    fakeDbState.users.push({ _id: employee, orgId: ORG, role: "employee", name: "Emp" });
    fakeSessionState.userId = employee;

    expect((await GET(new NextRequest("http://localhost/api/org/audit"))).status).toBe(403);
  });

  it("returns an empty list when nothing has happened yet", async () => {
    expect(await entries()).toEqual([]);
  });
});
