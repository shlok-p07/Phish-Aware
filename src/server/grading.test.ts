import { describe, it, expect } from "bun:test";
import { ObjectId } from "mongodb";
import type { ScenarioDoc, ScenarioCue } from "@/db";
import { gradeAttempt } from "./grading";

function makeScenario(overrides: Partial<ScenarioDoc> = {}): ScenarioDoc {
  return {
    _id: new ObjectId(),
    orgId: null,
    vector: "email",
    isPhish: true,
    sender: "security@paypa1.com",
    subject: "Verify your account",
    body: "Click here now.",
    links: [],
    attachmentName: null,
    cues: [],
    difficulty: "easy",
    isOnboarding: false,
    ...overrides,
  };
}

const cue = (label: string): ScenarioCue => ({
  label,
  severity: "high",
  explanation: `${label} explanation`,
});

describe("gradeAttempt — verdict + cue accounting", () => {
  it("splits selections into caught, missed, and false cues", () => {
    const scenario = makeScenario({
      cues: [cue("urgency"), cue("mismatched_domain")],
    });
    const result = gradeAttempt(scenario, true, ["urgency", "suspicious_link"], 70);

    expect(result.correct).toBe(true);
    expect(result.caughtCues).toEqual(["urgency"]);
    expect(result.missedCues).toEqual(["mismatched_domain"]);
    expect(result.falseCues).toEqual(["suspicious_link"]);
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
    const scenario = makeScenario({ cues: [cue("urgency"), cue("mismatched_domain")] });
    // 15 base + 2 caught * 5 = 25
    const result = gradeAttempt(scenario, true, ["urgency", "mismatched_domain"], 80);
    expect(result.xpAwarded).toBe(25);
  });

  it("penalizes false cues on a correct verdict", () => {
    const scenario = makeScenario({ cues: [cue("urgency")] });
    // 15 base + 1 caught * 5 - 1 false * 2 = 18
    const result = gradeAttempt(scenario, true, ["urgency", "spelling_errors"], 60);
    expect(result.xpAwarded).toBe(18);
  });

  it("gives a small consolation XP for a wrong verdict", () => {
    const scenario = makeScenario({ cues: [cue("urgency")] });
    const result = gradeAttempt(scenario, false, ["urgency"], 60);
    expect(result.xpAwarded).toBe(5);
  });

  it("never awards negative XP", () => {
    const scenario = makeScenario({ cues: [] });
    // 15 base - 8 false * 2 = -1 -> floored to 0
    const manyFalse = [
      "urgency",
      "mismatched_domain",
      "suspicious_link",
      "credential_request",
      "spelling_errors",
      "too_good_to_be_true",
      "impersonal_tone",
      "threat_language",
    ] as const;
    const result = gradeAttempt(scenario, false, [...manyFalse], 90);
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
