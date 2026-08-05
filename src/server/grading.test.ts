import { describe, it, expect } from "bun:test";
import { ObjectId } from "mongodb";
import type { ScenarioDoc, ScenarioCue } from "@/db";
import type { CueId } from "./cues";
import { gradeAttempt } from "./grading";

function makeScenario(overrides: Partial<ScenarioDoc> = {}): ScenarioDoc {
  const now = new Date();
  return {
    _id: new ObjectId(),
    scenarioId: new ObjectId(),
    orgId: null,
    vector: "email",
    isPhish: true,
    sender: "security@paypa1.com",
    subject: "Verify your account",
    body: "Click here now.",
    links: [],
    attachments: [],
    cues: [],
    difficulty: 1,
    isOnboarding: false,
    source: "library",
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

const cue = (type: CueId): ScenarioCue => ({
  type,
  severity: 3,
  explanation: `${type} explanation`,
});

describe("gradeAttempt — verdict + cue accounting", () => {
  it("splits selections into caught, missed, and false cues", () => {
    const scenario = makeScenario({
      cues: [cue("urgency_language"), cue("sender_domain")],
    });
    const result = gradeAttempt(scenario, true, ["urgency_language", "mismatched_link"], 70);

    expect(result.correct).toBe(true);
    expect(result.caughtCues).toEqual(["urgency_language"]);
    expect(result.missedCues).toEqual(["sender_domain"]);
    expect(result.falseCues).toEqual(["mismatched_link"]);
  });

  it("marks the verdict wrong when it disagrees with the scenario", () => {
    const scenario = makeScenario({ isPhish: true });
    const result = gradeAttempt(scenario, false, [], 50);
    expect(result.correct).toBe(false);
    expect(result.correctVerdict).toBe(false);
  });

  // The practice UI only ever toggles a cue, so it can't produce duplicates --
  // but the request body has no uniqueness constraint, so a raw POST could.
  it("dedupes repeated entries in selectedCues instead of counting each repeat", () => {
    const scenario = makeScenario({ cues: [cue("urgency_language")] });
    const result = gradeAttempt(
      scenario,
      true,
      ["urgency_language", "urgency_language", "urgency_language"],
      70,
    );
    expect(result.caughtCues).toEqual(["urgency_language"]);
  });

  it("dedupes repeated false cues the same way", () => {
    const scenario = makeScenario({ cues: [] });
    const result = gradeAttempt(scenario, true, ["spelling_grammar", "spelling_grammar"], 70);
    expect(result.falseCues).toEqual(["spelling_grammar"]);
  });
});

describe("gradeAttempt — XP", () => {
  it("awards base + per-caught XP for a correct verdict", () => {
    const scenario = makeScenario({ cues: [cue("urgency_language"), cue("sender_domain")] });
    // 15 base + 2 caught * 5 = 25
    const result = gradeAttempt(scenario, true, ["urgency_language", "sender_domain"], 80);
    expect(result.xpAwarded).toBe(25);
  });

  it("penalizes false cues on a correct verdict", () => {
    const scenario = makeScenario({ cues: [cue("urgency_language")] });
    // 15 base + 1 caught * 5 - 1 false * 2 = 18
    const result = gradeAttempt(scenario, true, ["urgency_language", "spelling_grammar"], 60);
    expect(result.xpAwarded).toBe(18);
  });

  it("gives a small consolation XP for a wrong verdict", () => {
    const scenario = makeScenario({ cues: [cue("urgency_language")] });
    const result = gradeAttempt(scenario, false, ["urgency_language"], 60);
    expect(result.xpAwarded).toBe(5);
  });

  it("never awards negative XP", () => {
    const scenario = makeScenario({ cues: [] });
    // 15 base - 8 false * 2 = -1 -> floored to 0
    const manyFalse: CueId[] = [
      "sender_domain",
      "mismatched_link",
      "urgency_language",
      "generic_greeting",
      "credential_request",
      "spelling_grammar",
      "unexpected_attachment",
      "suspicious_qr",
    ];
    const result = gradeAttempt(scenario, false, manyFalse, 90);
    expect(result.xpAwarded).toBeGreaterThanOrEqual(0);
  });

  it("doesn't award extra XP for repeating the same caught cue", () => {
    const scenario = makeScenario({ cues: [cue("urgency_language")] });
    // 15 base + 1 caught * 5 = 20, same as a single non-repeated selection.
    const result = gradeAttempt(
      scenario,
      true,
      ["urgency_language", "urgency_language", "urgency_language"],
      70,
    );
    expect(result.xpAwarded).toBe(20);
  });
});

describe("gradeAttempt — calibration note", () => {
  it("praises confident-and-correct answers", () => {
    const scenario = makeScenario({ cues: [] });
    const result = gradeAttempt(scenario, true, [], 80);
    expect(result.calibrationNote).toMatch(/great calibration/i);
  });

  it("flags confident-but-wrong answers", () => {
    const scenario = makeScenario({ isPhish: true, cues: [] });
    const result = gradeAttempt(scenario, false, [], 90);
    expect(result.calibrationNote).toMatch(/confident/i);
  });

  // Boundary values, not just interior ones -- >=65 and <40 are both
  // inclusive/exclusive at the exact threshold, and confidence is a real
  // reachable 0-100 integer from the API, not just the 50/60/70/80/90 the
  // rest of this suite happens to use.
  it("treats exactly 65 as confident (inclusive) when correct", () => {
    const scenario = makeScenario({ cues: [] });
    const result = gradeAttempt(scenario, true, [], 65);
    expect(result.calibrationNote).toMatch(/great calibration/i);
  });

  it("treats 64 as not-yet-confident when correct", () => {
    const scenario = makeScenario({ cues: [] });
    const result = gradeAttempt(scenario, true, [], 64);
    expect(result.calibrationNote).toMatch(/keep practicing/i);
  });

  it("treats exactly 39 as hesitant (below 40) when correct", () => {
    const scenario = makeScenario({ cues: [] });
    const result = gradeAttempt(scenario, true, [], 39);
    expect(result.calibrationNote).toMatch(/hesitant/i);
  });

  it("treats exactly 40 as no longer hesitant when correct", () => {
    const scenario = makeScenario({ cues: [] });
    const result = gradeAttempt(scenario, true, [], 40);
    expect(result.calibrationNote).toMatch(/keep practicing/i);
  });

  it("treats exactly 65 as confident when wrong, too", () => {
    const scenario = makeScenario({ isPhish: true, cues: [] });
    const result = gradeAttempt(scenario, false, [], 65);
    expect(result.calibrationNote).toMatch(/confident/i);
  });

  it("treats exactly 39 as good instinct to hesitate when wrong", () => {
    const scenario = makeScenario({ isPhish: true, cues: [] });
    const result = gradeAttempt(scenario, false, [], 39);
    expect(result.calibrationNote).toMatch(/good instinct/i);
  });

  it("falls back to the middle-band note for 40-64 regardless of verdict", () => {
    const correctScenario = makeScenario({ cues: [] });
    const wrongScenario = makeScenario({ isPhish: true, cues: [] });
    expect(gradeAttempt(correctScenario, true, [], 50).calibrationNote).toMatch(/keep practicing/i);
    expect(gradeAttempt(wrongScenario, false, [], 50).calibrationNote).toMatch(/keep practicing/i);
  });
});
