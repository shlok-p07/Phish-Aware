import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const { activeFocusFor } = await import("./assignedFocus");

const ORG = new ObjectId();
const OTHER_ORG = new ObjectId();
const ME = new ObjectId();

function campaign(focus: unknown, orgId = ORG) {
  const id = new ObjectId();
  fakeDbState.campaigns.push({ _id: id, campaignId: id, orgId, name: "C", focus });
  return id;
}

function assign(campaignId: ObjectId, orgId = ORG, userId = ME) {
  const id = new ObjectId();
  fakeDbState.assignments.push({ _id: id, assignmentId: id, campaignId, userId, orgId });
}

const focus = (minDifficulty: number, vectors: string[] = []) => ({
  vectors,
  minDifficulty,
  cues: [],
});

describe("activeFocusFor", () => {
  beforeEach(() => {
    resetFakeDbState();
  });

  it("returns nothing for somebody with no organisation", async () => {
    expect(await activeFocusFor(ME, null)).toBeNull();
  });

  it("returns nothing when nothing is assigned", async () => {
    expect(await activeFocusFor(ME, ORG)).toBeNull();
  });

  it("returns nothing when the assigned campaign asks for nothing specific", async () => {
    assign(campaign(null));

    expect(await activeFocusFor(ME, ORG)).toBeNull();
  });

  it("returns the focus of an assigned campaign", async () => {
    assign(campaign(focus(4, ["email"])));

    expect(await activeFocusFor(ME, ORG)).toEqual(focus(4, ["email"]));
  });

  it("picks the most demanding of several, so the harder floor satisfies both", async () => {
    assign(campaign(focus(2)));
    assign(campaign(focus(5)));
    assign(campaign(focus(3)));

    // Serving the easier one would leave the harder campaign stuck.
    expect((await activeFocusFor(ME, ORG))?.minDifficulty).toBe(5);
  });

  it("ignores another organisation's campaign", async () => {
    assign(campaign(focus(5, ["web"]), OTHER_ORG), OTHER_ORG);

    expect(await activeFocusFor(ME, ORG)).toBeNull();
  });

  it("ignores somebody else's assignment", async () => {
    assign(campaign(focus(5)), ORG, new ObjectId());

    expect(await activeFocusFor(ME, ORG)).toBeNull();
  });
});
