import { describe, it, expect } from "bun:test";
import { ObjectId } from "mongodb";
import type { ScenarioDoc, ScenarioCue } from "@/db";
import type { CueId } from "./cues";
import {
  gradeAttempt,
  gradedCues,
  GRADED_CUE_SEVERITY_FLOOR,
  MAX_GRADED_CUES,
} from "./grading";

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

// Defaults to the grading floor, so a cue is significant unless a test says
// otherwise.
const cue = (type: CueId, severity: number = GRADED_CUE_SEVERITY_FLOOR): ScenarioCue => ({
  type,
  severity,
  explanation: `${type} explanation`,
});

describe("gradeAttempt: verdict + cue accounting", () => {
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
    // correctVerdict is what the answer was, not whether the learner got it.
    // It used to be assigned the same value as `correct`, which this assertion
    // had encoded as the expectation.
    expect(result.correctVerdict).toBe(true);
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

describe("gradeAttempt: XP", () => {
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

describe("gradeAttempt: calibration note", () => {
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

describe("gradeAttempt: what is persisted", () => {
  // Reuses the file-level `cue` helper; this only groups cues into a scenario.
  const withCues = (...types: CueId[]) => makeScenario({ cues: types.map(cue) });

  /**
   * The stored attempt must equal what was scored. Grading already de-duplicated
   * internally, but the route used to persist the raw request array, so a
   * crafted POST left a record that disagreed with its own score.
   */
  it("returns the de-duplicated selection, not the caller's array", () => {
    const scenario = withCues("sender_domain", "urgency_language");
    const graded = gradeAttempt(
      scenario,
      true,
      ["sender_domain", "sender_domain", "sender_domain"] as CueId[],
      80,
    );
    expect(graded.selectedCues).toEqual(["sender_domain"]);
  });

  it("preserves first-seen order so the record reads as the learner answered", () => {
    const scenario = withCues("sender_domain", "urgency_language");
    const graded = gradeAttempt(
      scenario,
      true,
      ["urgency_language", "sender_domain", "urgency_language"] as CueId[],
      80,
    );
    expect(graded.selectedCues).toEqual(["urgency_language", "sender_domain"]);
  });

  it("agrees with its own breakdown", () => {
    const scenario = withCues("sender_domain");
    const graded = gradeAttempt(
      scenario,
      true,
      ["sender_domain", "sender_domain", "generic_greeting"] as CueId[],
      80,
    );
    const accounted = [...graded.caughtCues, ...graded.falseCues].sort();
    expect(graded.selectedCues.slice().sort()).toEqual(accounted);
  });
});

describe("gradedCues", () => {
  it("ignores red flags too minor to hold a learner to", () => {
    // Two thirds of the generated pool carried a cue the model itself rated 1
    // or 2 -- including a spelling cue whose explanation said the spelling was
    // fine. Grading against those reported misses that were not real.
    const scenario = makeScenario({
      cues: [cue("sender_domain", 5), cue("spelling_grammar", 1)],
    });
    expect(gradedCues(scenario)).toEqual(["sender_domain"]);
  });

  it("keeps everything at or above the floor", () => {
    const scenario = makeScenario({
      cues: [cue("sender_domain", GRADED_CUE_SEVERITY_FLOOR), cue("urgency_language", 5)],
    });
    expect(gradedCues(scenario).sort()).toEqual(["sender_domain", "urgency_language"]);
  });

  it("caps the list so feedback stays actionable", () => {
    const scenario = makeScenario({
      cues: [
        cue("sender_domain", 5),
        cue("mismatched_link", 5),
        cue("urgency_language", 4),
        cue("credential_request", 4),
        cue("generic_greeting", 3),
        cue("unexpected_attachment", 3),
        cue("spelling_grammar", 3),
      ],
    });
    expect(gradedCues(scenario)).toHaveLength(MAX_GRADED_CUES);
  });

  it("keeps the most severe when it has to choose", () => {
    const scenario = makeScenario({
      cues: [
        cue("spelling_grammar", 3),
        cue("generic_greeting", 3),
        cue("sender_domain", 5),
        cue("mismatched_link", 5),
        cue("urgency_language", 4),
      ],
    });
    const graded = gradedCues(scenario);
    expect(graded).toContain("sender_domain");
    expect(graded).toContain("mismatched_link");
    expect(graded).toContain("urgency_language");
  });

  it("still grades something when nothing meets the floor", () => {
    // Sixteen scenarios in the pool have no cue at or above the floor. Telling
    // a learner they missed nothing on a message that was phishing would be
    // worse than grading a weak cue.
    const scenario = makeScenario({
      cues: [cue("spelling_grammar", 1), cue("generic_greeting", 2)],
    });
    expect(gradedCues(scenario)).toEqual(["generic_greeting"]);
  });

  it("returns nothing for a scenario with no cues at all", () => {
    expect(gradedCues(makeScenario({ cues: [] }))).toEqual([]);
  });
});

describe("grading against the significant cues only", () => {
  it("does not report a minor cue as missed", () => {
    const scenario = makeScenario({
      cues: [cue("sender_domain", 5), cue("spelling_grammar", 1)],
    });
    const result = gradeAttempt(scenario, true, ["sender_domain"], 80);
    expect(result.missedCues).toEqual([]);
    expect(result.caughtCues).toEqual(["sender_domain"]);
  });

  it("does not punish a learner for spotting a real but minor cue", () => {
    // It is a fair read of the message. Counting it as a false positive would
    // teach people to under-report, which is the opposite of the goal.
    const scenario = makeScenario({
      cues: [cue("sender_domain", 5), cue("spelling_grammar", 1)],
    });
    const result = gradeAttempt(scenario, true, ["sender_domain", "spelling_grammar"], 80);
    expect(result.falseCues).toEqual([]);
  });

  it("still counts a cue the scenario does not carry at all as a false positive", () => {
    const scenario = makeScenario({ cues: [cue("sender_domain", 5)] });
    const result = gradeAttempt(scenario, true, ["sender_domain", "suspicious_qr"], 80);
    expect(result.falseCues).toEqual(["suspicious_qr"]);
  });

  it("keeps caught and missed a partition of the graded set", () => {
    // Anything else means the totals a learner is shown do not add up.
    const scenario = makeScenario({
      cues: [
        cue("sender_domain", 5),
        cue("mismatched_link", 4),
        cue("urgency_language", 3),
        cue("spelling_grammar", 1),
      ],
    });
    const result = gradeAttempt(scenario, true, ["sender_domain", "suspicious_qr"], 80);
    expect([...result.caughtCues, ...result.missedCues].sort()).toEqual(
      gradedCues(scenario).sort(),
    );
  });

  it("bounds how much xp one scenario can yield from cues", () => {
    // With seven cues listed, selecting every one of them farmed xp. The cap
    // is now what limits the reward.
    const scenario = makeScenario({
      cues: [
        cue("sender_domain", 5),
        cue("mismatched_link", 5),
        cue("urgency_language", 5),
        cue("credential_request", 5),
        cue("generic_greeting", 5),
        cue("unexpected_attachment", 5),
        cue("spelling_grammar", 5),
      ],
    });
    const all: CueId[] = [
      "sender_domain",
      "mismatched_link",
      "urgency_language",
      "credential_request",
      "generic_greeting",
      "unexpected_attachment",
      "spelling_grammar",
    ];
    const result = gradeAttempt(scenario, true, all, 80);
    expect(result.caughtCues).toHaveLength(MAX_GRADED_CUES);
    expect(result.xpAwarded).toBe(15 + MAX_GRADED_CUES * 5);
  });
});
