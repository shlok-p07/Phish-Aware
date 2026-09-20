import { describe, expect, it } from "bun:test";
import { SEED_SCENARIOS } from "./seedScenarios";
import { CUE_LABELS, type CueId } from "./cues";
import { VECTOR_ALLOWED_CUES } from "./scenarioGenerator";
import { PRACTICE_VECTORS, type PracticeVector } from "./attackProfiles";

/**
 * Invariants for the hand-written practice pool.
 *
 * Generated scenarios are filtered against VECTOR_ALLOWED_CUES before they are
 * ever stored, so the model cannot claim a phone call carried an attachment.
 * The static library went through no such check -- it is typed against the cue
 * union, which stops a misspelled id but not a cue the medium cannot present.
 * That failure is quiet and lands on the learner: the cue is graded, so
 * selecting it is scored as a false positive, and not selecting it is scored as
 * a miss.
 */

const CUE_IDS = new Set(Object.keys(CUE_LABELS));

describe("seed scenario pool", () => {
  it("only cites cues that exist in the shared vocabulary", () => {
    for (const scenario of SEED_SCENARIOS) {
      for (const cue of scenario.cues ?? []) {
        expect(CUE_IDS.has(cue.type)).toBe(true);
      }
    }
  });

  it("only cites cues the medium can actually present", () => {
    for (const scenario of SEED_SCENARIOS) {
      const allowed = VECTOR_ALLOWED_CUES[scenario.vector as PracticeVector];
      // No entry means every cue applies, which is email only.
      if (!allowed) continue;
      for (const cue of scenario.cues ?? []) {
        if (!allowed.includes(cue.type as CueId)) {
          throw new Error(
            `${scenario.vector} scenario "${scenario.sender}" cites "${cue.type}", ` +
              `which that vector cannot show. Allowed: ${allowed.join(", ")}`,
          );
        }
      }
    }
  });

  it("uses a vector the product actually trains on", () => {
    for (const scenario of SEED_SCENARIOS) {
      expect(PRACTICE_VECTORS).toContain(scenario.vector as PracticeVector);
    }
  });

  it("gives every phishing scenario at least one cue to find", () => {
    // A phish with no cues is unanswerable: the learner can call it phishing
    // but has nothing to point at, and the grader credits them for nothing.
    for (const scenario of SEED_SCENARIOS) {
      if (!scenario.isPhish) continue;
      expect((scenario.cues ?? []).length).toBeGreaterThan(0);
    }
  });

  it("leaves legitimate scenarios with no cues at all", () => {
    // A cue on a legitimate message means "this is a tell" about something that
    // is not a scam, which teaches the wrong lesson twice over.
    for (const scenario of SEED_SCENARIOS) {
      if (scenario.isPhish) continue;
      expect(scenario.cues ?? []).toHaveLength(0);
    }
  });

  it("keeps severity and difficulty inside the documented scales", () => {
    for (const scenario of SEED_SCENARIOS) {
      expect(scenario.difficulty).toBeGreaterThanOrEqual(1);
      expect(scenario.difficulty).toBeLessThanOrEqual(5);
      for (const cue of scenario.cues ?? []) {
        expect(cue.severity).toBeGreaterThanOrEqual(1);
        expect(cue.severity).toBeLessThanOrEqual(3);
      }
    }
  });

  it("explains every cue, since the explanation is the teaching", () => {
    for (const scenario of SEED_SCENARIOS) {
      for (const cue of scenario.cues ?? []) {
        expect(cue.explanation.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("stays close to an even phish/legitimate split", () => {
    // The pool was 20 phishing to 11 legitimate once, and a learner who
    // answered "phishing" every round scored about 65% without exercising any
    // judgement -- accuracy stops meaning anything at that ratio. Selection
    // also balances the recent mix, but it can only draw from what exists.
    const phish = SEED_SCENARIOS.filter((s) => s.isPhish).length;
    const share = phish / SEED_SCENARIOS.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  it("covers the help-desk and developer-targeting seats, not just the victim's", () => {
    // Every scenario used to put the learner on the receiving end of a scam.
    // The breaches this pool is drawn from started at a help desk and at a
    // developer, so those seats need content of their own.
    const bodies = SEED_SCENARIOS.map((s) => s.body);
    expect(bodies.some((b) => b.startsWith("You are the IT help desk."))).toBe(true);
    expect(bodies.some((b) => /repo|repository/i.test(b))).toBe(true);
  });
});
