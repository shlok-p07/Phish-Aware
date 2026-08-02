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
});
