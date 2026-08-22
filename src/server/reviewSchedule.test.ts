import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";

await installMongoMock();

const {
  applyReviewOutcomes,
  outcomesForAttempt,
  dueCues,
  reviewSummary,
  reviewTargetLabel,
} = await import("./reviewSchedule");
const { MASTERY_STREAK } = await import("./spacedReview");

const USER = new ObjectId();
const ORG = new ObjectId();
const NOW = new Date("2026-08-20T12:00:00.000Z");
const laterBy = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe("outcomesForAttempt", () => {
  it("grades each red flag individually", () => {
    const outcomes = outcomesForAttempt({
      correct: true,
      caughtCues: ["sender_domain"],
      missedCues: ["urgency_language"],
    });
    expect(outcomes).toContainEqual({
      targetType: "cueType",
      targetValue: "sender_domain",
      spotted: true,
    });
    expect(outcomes).toContainEqual({
      targetType: "cueType",
      targetValue: "urgency_language",
      spotted: false,
    });
  });

  it("uses the verdict for levers and the channel, which are not graded individually", () => {
    const outcomes = outcomesForAttempt({
      correct: false,
      caughtCues: [],
      missedCues: [],
      leversPresent: ["authority"],
      vector: "sms",
    });
    expect(outcomes).toContainEqual({
      targetType: "emotionalLever",
      targetValue: "authority",
      spotted: false,
    });
    expect(outcomes).toContainEqual({ targetType: "vector", targetValue: "sms", spotted: false });
  });

  it("does not schedule over-reported red flags", () => {
    // Rehearsing a cue the learner wrongly flagged is the opposite of the
    // correction they need.
    const outcomes = outcomesForAttempt({
      correct: true,
      caughtCues: [],
      missedCues: [],
      leversPresent: [],
      vector: null,
    });
    expect(outcomes).toEqual([]);
  });

  it("collapses a duplicated target so one result cannot silently overwrite another", () => {
    const outcomes = outcomesForAttempt({
      correct: true,
      caughtCues: ["urgency_language"],
      missedCues: ["urgency_language"],
    });
    expect(outcomes.filter((o) => o.targetValue === "urgency_language")).toHaveLength(1);
  });

  it("omits the channel when the scenario has none", () => {
    const outcomes = outcomesForAttempt({ correct: true, caughtCues: [], missedCues: [] });
    expect(outcomes.some((o) => o.targetType === "vector")).toBe(false);
  });
});

describe("applyReviewOutcomes", () => {
  beforeEach(resetFakeDbState);

  it("creates a schedule row the first time a target is seen", async () => {
    await applyReviewOutcomes(
      USER,
      ORG,
      [{ targetType: "cueType", targetValue: "urgency_language", spotted: false }],
      NOW,
    );
    expect(fakeDbState.reviews).toHaveLength(1);
    const [row] = fakeDbState.reviews;
    expect(row.targetValue).toBe("urgency_language");
    expect((row.userId as ObjectId).equals(USER)).toBe(true);
    expect(row.streak).toBe(0);
    expect(row.reviewId).toBeDefined();
    // The shared spec's conventions, which the ReviewDoc type promises are there.
    expect(row.metadata).toEqual({});
    expect(row.deletedAt).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it("updates in place rather than accumulating rows for one target", async () => {
    const miss = [{ targetType: "cueType" as const, targetValue: "urgency_language", spotted: false }];
    await applyReviewOutcomes(USER, ORG, miss, NOW);
    await applyReviewOutcomes(USER, ORG, miss, NOW);
    expect(fakeDbState.reviews).toHaveLength(1);
  });

  it("advances the streak across successes", async () => {
    const hit = [{ targetType: "cueType" as const, targetValue: "urgency_language", spotted: true }];
    await applyReviewOutcomes(USER, ORG, hit, NOW);
    await applyReviewOutcomes(USER, ORG, hit, NOW);
    expect(fakeDbState.reviews[0]!.streak).toBe(2);
  });

  it("resets the streak on a miss", async () => {
    const target = { targetType: "cueType" as const, targetValue: "urgency_language" };
    await applyReviewOutcomes(USER, ORG, [{ ...target, spotted: true }], NOW);
    await applyReviewOutcomes(USER, ORG, [{ ...target, spotted: false }], NOW);
    expect(fakeDbState.reviews[0]!.streak).toBe(0);
  });

  it("accepts a learner with no organisation", async () => {
    // A self-signup learner deserves a schedule too; the original validator
    // required an objectId orgId and could not represent one.
    await applyReviewOutcomes(
      USER,
      null,
      [{ targetType: "vector", targetValue: "email", spotted: true }],
      NOW,
    );
    expect(fakeDbState.reviews[0]!.orgId).toBeNull();
  });

  it("does nothing when there is nothing to record", async () => {
    await applyReviewOutcomes(USER, ORG, [], NOW);
    expect(fakeDbState.reviews).toHaveLength(0);
  });

  it("keeps one learner's schedule separate from another's", async () => {
    const other = new ObjectId();
    const target = [{ targetType: "cueType" as const, targetValue: "urgency_language", spotted: false }];
    await applyReviewOutcomes(USER, ORG, target, NOW);
    await applyReviewOutcomes(other, ORG, target, NOW);
    expect(fakeDbState.reviews).toHaveLength(2);
  });
});

describe("dueCues", () => {
  beforeEach(resetFakeDbState);

  const seed = (targetValue: string, dueAt: Date, easeFactor = 2, targetType = "cueType") => {
    const id = new ObjectId();
    fakeDbState.reviews.push({
      _id: id,
      reviewId: id,
      userId: USER,
      orgId: ORG,
      targetType,
      targetValue,
      dueAt,
      interval: 1,
      easeFactor,
      streak: 0,
      lastReviewedAt: null,
    });
  };

  it("returns only targets that have come due", async () => {
    seed("urgency_language", laterBy(-1));
    seed("sender_domain", laterBy(5));
    expect(await dueCues(USER, NOW)).toEqual(["urgency_language"]);
  });

  it("puts the worst-struggled cue first", async () => {
    seed("urgency_language", laterBy(-1), 2.4);
    seed("sender_domain", laterBy(-1), 1.4);
    expect(await dueCues(USER, NOW)).toEqual(["sender_domain", "urgency_language"]);
  });

  it("ignores levers and channels, which are not cues selection can steer by", async () => {
    seed("authority", laterBy(-1), 2, "emotionalLever");
    seed("email", laterBy(-1), 2, "vector");
    expect(await dueCues(USER, NOW)).toEqual([]);
  });

  it("drops a target whose cue no longer exists in the taxonomy", async () => {
    // A schedule row can outlive the cue it was written against; feeding a
    // retired id into selection would silently match nothing.
    seed("retired_cue_from_2024", laterBy(-1));
    expect(await dueCues(USER, NOW)).toEqual([]);
  });

  it("caps how many cues it will ask selection to satisfy at once", async () => {
    for (const cue of ["urgency_language", "sender_domain", "mismatched_link", "generic_greeting"]) {
      seed(cue, laterBy(-1));
    }
    expect((await dueCues(USER, NOW)).length).toBeLessThanOrEqual(3);
  });
});

describe("reviewSummary", () => {
  beforeEach(resetFakeDbState);

  it("reports nothing tracked for a learner who has not practised", async () => {
    const summary = await reviewSummary(USER, NOW);
    expect(summary).toMatchObject({ mastered: 0, due: 0, tracked: 0, nextDueAt: null });
  });

  it("counts a mastered target only after a full run of successes", async () => {
    const hit = [{ targetType: "cueType" as const, targetValue: "urgency_language", spotted: true }];
    for (let i = 1; i < MASTERY_STREAK; i++) {
      await applyReviewOutcomes(USER, ORG, hit, NOW);
    }
    expect((await reviewSummary(USER, NOW)).mastered).toBe(0);
    await applyReviewOutcomes(USER, ORG, hit, NOW);
    expect((await reviewSummary(USER, NOW)).mastered).toBe(1);
  });

  it("reports when the next target comes back if nothing is due", async () => {
    await applyReviewOutcomes(
      USER,
      ORG,
      [{ targetType: "cueType", targetValue: "urgency_language", spotted: true }],
      NOW,
    );
    const summary = await reviewSummary(USER, NOW);
    expect(summary.due).toBe(0);
    expect(summary.nextDueAt).toEqual(laterBy(1));
  });

  it("labels targets for display rather than exposing raw ids", async () => {
    const id = new ObjectId();
    fakeDbState.reviews.push({
      _id: id,
      reviewId: id,
      userId: USER,
      orgId: ORG,
      targetType: "cueType",
      targetValue: "sender_domain",
      dueAt: laterBy(-1),
      interval: 1,
      easeFactor: 2,
      streak: 0,
      lastReviewedAt: null,
    });
    const summary = await reviewSummary(USER, NOW);
    expect(summary.dueTargets).toEqual(["Mismatched sender domain"]);
  });

  it("a missed target is owed tomorrow, not immediately", async () => {
    // Spacing is the point: same-session reinforcement is the adaptive engine's
    // job, and re-serving a cue seconds after a miss tests recall of the answer
    // rather than of the red flag.
    await applyReviewOutcomes(
      USER,
      ORG,
      [{ targetType: "cueType", targetValue: "sender_domain", spotted: false }],
      NOW,
    );
    expect((await reviewSummary(USER, NOW)).due).toBe(0);
    expect((await reviewSummary(USER, laterBy(1))).due).toBe(1);
  });
});

describe("reviewTargetLabel", () => {
  it("labels each kind of target", () => {
    expect(reviewTargetLabel("cueType", "sender_domain")).toBeTruthy();
    expect(reviewTargetLabel("emotionalLever", "authority")).toBeTruthy();
    expect(reviewTargetLabel("vector", "qr")).toBe("QR code");
  });

  it("humanises an unknown value instead of throwing or leaking the id", () => {
    expect(reviewTargetLabel("cueType", "some_retired_cue")).toBe("Some retired cue");
  });

  it("survives an empty value", () => {
    expect(reviewTargetLabel("vector", "")).toBe("");
  });
});
