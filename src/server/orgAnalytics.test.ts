import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const { computeMemberStats, riskLevelForAccuracy } = await import("./orgAnalytics");

function seedAttempts(userId: ObjectId, correct: number, incorrect: number) {
  for (let i = 0; i < correct; i++) {
    fakeDbState.attempts.push({ _id: new ObjectId(), userId, correct: true });
  }
  for (let i = 0; i < incorrect; i++) {
    fakeDbState.attempts.push({ _id: new ObjectId(), userId, correct: false });
  }
}

describe("riskLevelForAccuracy", () => {
  it("treats a member with no attempts as high risk", () => {
    // Unproven is not the same as safe: somebody who has never practised is
    // exactly who a campaign should reach.
    expect(riskLevelForAccuracy(0, 0)).toBe("high");
    expect(riskLevelForAccuracy(100, 0)).toBe("high");
  });

  it("bands accuracy at 80 and 50", () => {
    expect(riskLevelForAccuracy(80, 5)).toBe("low");
    expect(riskLevelForAccuracy(79, 5)).toBe("medium");
    expect(riskLevelForAccuracy(50, 5)).toBe("medium");
    expect(riskLevelForAccuracy(49, 5)).toBe("high");
  });

  it("handles the extremes", () => {
    expect(riskLevelForAccuracy(100, 1)).toBe("low");
    expect(riskLevelForAccuracy(0, 1)).toBe("high");
  });
});

describe("computeMemberStats", () => {
  beforeEach(() => {
    resetFakeDbState();
  });

  it("returns accuracy as a percentage and the attempt count", async () => {
    const id = new ObjectId();
    seedAttempts(id, 3, 1);

    const stats = await computeMemberStats([id]);

    expect(stats.get(id.toString())).toEqual({ accuracy: 75, totalAttempts: 4 });
  });

  it("includes a member with no attempts rather than omitting them", async () => {
    const id = new ObjectId();

    const stats = await computeMemberStats([id]);

    // Omitting them would drop them out of the org's averages and headcounts
    // entirely, which is how an untrained member becomes invisible.
    expect(stats.get(id.toString())).toEqual({ accuracy: 0, totalAttempts: 0 });
  });

  it("keeps members separate", async () => {
    const a = new ObjectId();
    const b = new ObjectId();
    seedAttempts(a, 1, 0);
    seedAttempts(b, 0, 1);

    const stats = await computeMemberStats([a, b]);

    expect(stats.get(a.toString())?.accuracy).toBe(100);
    expect(stats.get(b.toString())?.accuracy).toBe(0);
  });

  it("ignores attempts belonging to somebody not asked about", async () => {
    const asked = new ObjectId();
    const other = new ObjectId();
    seedAttempts(asked, 1, 0);
    seedAttempts(other, 0, 4);

    const stats = await computeMemberStats([asked]);

    expect(stats.size).toBe(1);
    expect(stats.get(asked.toString())?.totalAttempts).toBe(1);
  });

  it("returns an empty map for an empty request", async () => {
    expect((await computeMemberStats([])).size).toBe(0);
  });

  it("keeps two decimal places, so risk banding is not skewed by rounding", async () => {
    const id = new ObjectId();
    seedAttempts(id, 2, 1); // 66.66...

    // Callers that display this round it to whole numbers themselves; the
    // computation stays precise so a member sitting just under a band boundary
    // is not rounded across it.
    expect((await computeMemberStats([id])).get(id.toString())?.accuracy).toBe(66.67);
  });
});
