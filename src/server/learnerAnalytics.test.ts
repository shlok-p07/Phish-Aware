import { describe, expect, it } from "bun:test";
import { computeLearnerAnalytics, weakestCues, type AnalyticsAttempt } from "./learnerAnalytics";

const S1 = "scenario-1";
const S2 = "scenario-2";
const vectors = new Map([
  [S1, "email"],
  [S2, "sms"],
]);

function attempt(overrides: Partial<AnalyticsAttempt> = {}): AnalyticsAttempt {
  return {
    scenarioId: { toString: () => S1 },
    caughtCues: [],
    missedCues: [],
    confidence: 50,
    correct: true,
    createdAt: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  };
}

describe("computeLearnerAnalytics", () => {
  it("returns zeroes for somebody who has never practised", () => {
    expect(computeLearnerAnalytics([], vectors)).toEqual({
      cueAccuracy: [],
      vectorAccuracy: [],
      calibrationScore: 0,
      progressOverTime: [],
      totalAttempts: 0,
    });
  });

  it("rates a cue by how often it was caught rather than missed", () => {
    const analytics = computeLearnerAnalytics(
      [
        attempt({ caughtCues: ["sender_domain"] }),
        attempt({ caughtCues: ["sender_domain"] }),
        attempt({ missedCues: ["sender_domain"] }),
      ],
      vectors,
    );

    expect(analytics.cueAccuracy).toEqual([
      { cueId: "sender_domain", label: expect.any(String), attempts: 3, rate: 66.67 },
    ]);
  });

  it("attributes accuracy to the vector of the scenario attempted", () => {
    const analytics = computeLearnerAnalytics(
      [
        attempt({ correct: true }),
        attempt({ correct: false }),
        attempt({ scenarioId: { toString: () => S2 }, correct: true }),
      ],
      vectors,
    );

    expect(analytics.vectorAccuracy).toEqual(
      expect.arrayContaining([
        { vector: "email", attempts: 2, rate: 50 },
        { vector: "sms", attempts: 1, rate: 100 },
      ]),
    );
  });

  it("ignores an attempt whose scenario has since been removed", () => {
    // Guessing a vector would put a wrong bar on somebody's profile.
    const analytics = computeLearnerAnalytics(
      [attempt({ scenarioId: { toString: () => "deleted" } })],
      vectors,
    );

    expect(analytics.vectorAccuracy).toEqual([]);
    expect(analytics.totalAttempts).toBe(1);
  });

  it("scores confident and right at the top of calibration", () => {
    expect(
      computeLearnerAnalytics([attempt({ confidence: 100, correct: true })], vectors)
        .calibrationScore,
    ).toBe(100);
  });

  it("scores confident and wrong at the bottom", () => {
    // The most dangerous learner in the building, and a bare accuracy figure
    // hides them.
    expect(
      computeLearnerAnalytics([attempt({ confidence: 100, correct: false })], vectors)
        .calibrationScore,
    ).toBe(0);
  });

  it("rewards doubt that turned out to be justified", () => {
    expect(
      computeLearnerAnalytics([attempt({ confidence: 10, correct: false })], vectors)
        .calibrationScore,
    ).toBe(90);
  });

  it("groups progress by day, oldest first", () => {
    const analytics = computeLearnerAnalytics(
      [
        attempt({ createdAt: new Date("2026-08-02T09:00:00Z"), correct: true }),
        attempt({ createdAt: new Date("2026-08-01T09:00:00Z"), correct: true }),
        attempt({ createdAt: new Date("2026-08-01T21:00:00Z"), correct: false }),
      ],
      vectors,
    );

    expect(analytics.progressOverTime.map((d) => [d.date.toISOString().slice(0, 10), d.accuracyRate, d.attempts])).toEqual([
      ["2026-08-01", 50, 2],
      ["2026-08-02", 100, 1],
    ]);
  });

  it("counts every attempt, including ones with no cues recorded", () => {
    expect(computeLearnerAnalytics([attempt(), attempt()], vectors).totalAttempts).toBe(2);
  });
});

describe("weakestCues", () => {
  it("puts the worst first and honours the limit", () => {
    const analytics = computeLearnerAnalytics(
      [
        attempt({ missedCues: ["sender_domain"] }),
        attempt({ caughtCues: ["urgency_language"] }),
        attempt({ caughtCues: ["mismatched_link"], missedCues: ["generic_greeting"] }),
      ],
      vectors,
    );

    const weakest = weakestCues(analytics, 2);

    expect(weakest).toHaveLength(2);
    expect(weakest[0]!.rate).toBeLessThanOrEqual(weakest[1]!.rate);
    expect(weakest[0]!.rate).toBe(0);
  });

  it("returns nothing when there is nothing to rank", () => {
    expect(weakestCues(computeLearnerAnalytics([], vectors))).toEqual([]);
  });
});
