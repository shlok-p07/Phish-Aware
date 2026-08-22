import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const { recordAudit } = await import("./audit");

const ORG = new ObjectId();
const ACTOR = new ObjectId();

describe("recordAudit", () => {
  beforeEach(() => {
    resetFakeDbState();
  });

  it("writes an entry with the actor, action and target", async () => {
    const target = new ObjectId();

    await recordAudit({
      orgId: ORG,
      actorId: ACTOR,
      action: "member.role_changed",
      targetType: "user",
      targetId: target,
      metadata: { role: "admin" },
    });

    const [entry] = fakeDbState.auditLogs;
    expect(entry.action).toBe("member.role_changed");
    expect((entry.orgId as ObjectId).equals(ORG)).toBe(true);
    expect((entry.actorId as ObjectId).equals(ACTOR)).toBe(true);
    expect(entry.metadata).toEqual({ role: "admin" });
  });

  it("keeps the caller's metadata rather than the empty default", async () => {
    // specDefaults() also supplies metadata; spreading it last would silently
    // discard the context that makes an entry readable a year from now.
    await recordAudit({
      orgId: ORG,
      actorId: ACTOR,
      action: "department.renamed",
      targetType: "department",
      metadata: { from: "Finance", to: "Treasury" },
    });

    expect(fakeDbState.auditLogs[0].metadata).toEqual({ from: "Finance", to: "Treasury" });
  });

  it("records the caller's address when headers are supplied", async () => {
    await recordAudit({
      orgId: ORG,
      actorId: ACTOR,
      action: "member.removed",
      targetType: "user",
      headers: new Headers({ "x-forwarded-for": "203.0.113.7" }),
    });

    expect(fakeDbState.auditLogs[0].ip).toBe("203.0.113.7");
  });

  it("defaults a missing target to null rather than omitting it", async () => {
    await recordAudit({
      orgId: ORG,
      actorId: ACTOR,
      action: "org.settings_updated",
      targetType: "organization",
    });

    expect(fakeDbState.auditLogs[0].targetId).toBeNull();
    expect(fakeDbState.auditLogs[0].metadata).toEqual({});
  });

  it("never throws into its caller when the write fails", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    // The action already happened. Failing here would report something untrue
    // and turn a successful role change into a 500.
    const original = fakeDbState.auditLogs;
    // @ts-expect-error deliberately breaking the collection to force a failure
    fakeDbState.auditLogs = null;

    await expect(
      recordAudit({ orgId: ORG, actorId: ACTOR, action: "member.invited", targetType: "invitation" }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();

    fakeDbState.auditLogs = original;
    warn.mockRestore();
  });
});
