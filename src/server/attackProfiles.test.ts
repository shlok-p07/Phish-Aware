import { describe, expect, it } from "bun:test";
import {
  pickAttackProfile,
  pickVector,
  pickIsPhish,
  difficultyForAwarenessScore,
  DEPARTMENT_ATTACK_TYPES,
  PERSUASION_TACTIC_LABELS,
  PRACTICE_VECTORS,
  type AttackTypeId,
} from "./attackProfiles";
import { DEPARTMENTS } from "@/lib/onboarding-survey";

const ALL_TACTICS = Object.keys(PERSUASION_TACTIC_LABELS);
const UNIVERSAL: AttackTypeId[] = [
  "credential_harvesting",
  "mfa_fatigue",
  "it_helpdesk_scam",
  "package_delivery_scam",
  "malware_delivery",
];

/** Draw many times so randomized behavior gets exercised, not just one lucky/unlucky roll. */
function drawMany(department: string | null, times = 200) {
  return Array.from({ length: times }, () => pickAttackProfile(department));
}

describe("pickAttackProfile", () => {
  it("always returns a persuasion tactic from the fixed 8-value vocabulary", () => {
    for (const { persuasionTactic } of drawMany("Finance")) {
      expect(ALL_TACTICS).toContain(persuasionTactic);
    }
  });

  it("eventually draws more than one distinct persuasion tactic (not narrowed to a single value)", () => {
    const seen = new Set(drawMany("IT").map((p) => p.persuasionTactic));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("never picks an attack type outside what its department maps to", () => {
    for (const department of DEPARTMENTS) {
      const allowed = DEPARTMENT_ATTACK_TYPES[department];
      for (const { attackType } of drawMany(department, 100)) {
        expect(allowed).toContain(attackType);
      }
    }
  });

  it("stays within the universal set for a department name we retired", () => {
    for (const { attackType } of drawMany("Management")) {
      expect(UNIVERSAL).toContain(attackType);
    }
  });

  it("null department falls back to the universal set only", () => {
    for (const { attackType } of drawMany(null)) {
      expect(UNIVERSAL).toContain(attackType);
    }
  });

  it("an unmapped/garbage department string falls back to the universal set, not a crash", () => {
    for (const { attackType } of drawMany("Not A Real Department")) {
      expect(UNIVERSAL).toContain(attackType);
    }
  });

  it("empty-string department is treated the same as null (falls back to universal)", () => {
    for (const { attackType } of drawMany("")) {
      expect(UNIVERSAL).toContain(attackType);
    }
  });

  it("can actually reach the department-specific attack types Finance is supposed to unlock", () => {
    const seen = new Set(drawMany("Finance", 500).map((p) => p.attackType));
    expect(seen.has("invoice_fraud") || seen.has("bec")).toBe(true);
  });

  it("Finance never draws an attack type scoped to a different department (e.g. payroll_fraud)", () => {
    for (const { attackType } of drawMany("Finance", 300)) {
      expect(attackType).not.toBe("payroll_fraud");
      expect(attackType).not.toBe("cloud_file_sharing_scam");
      expect(attackType).not.toBe("software_update_scam");
    }
  });

  it("every department key in the mapping table only lists real AttackTypeId values", () => {
    const validIds = new Set([
      ...UNIVERSAL,
      "bec",
      "invoice_fraud",
      "payroll_fraud",
      "cloud_file_sharing_scam",
      "software_update_scam",
    ]);
    for (const attackTypes of Object.values(DEPARTMENT_ATTACK_TYPES)) {
      for (const id of attackTypes) {
        expect(validIds.has(id)).toBe(true);
      }
    }
  });

  // The survey is where these strings originate; a department offered there
  // with no mapping here would silently fall back to the universal set, which
  // looks like working code rather than a missing entry.
  it("maps exactly the departments the onboarding survey offers", () => {
    expect(Object.keys(DEPARTMENT_ATTACK_TYPES).sort()).toEqual([...DEPARTMENTS].sort());
  });

  it("gives every department at least the universal attack types", () => {
    for (const department of DEPARTMENTS) {
      for (const id of UNIVERSAL) {
        expect(DEPARTMENT_ATTACK_TYPES[department]).toContain(id);
      }
    }
  });
});

describe("pickVector", () => {
  it("always returns a value from the supported vector list", () => {
    for (let i = 0; i < 200; i++) {
      expect(PRACTICE_VECTORS).toContain(pickVector());
    }
  });

  it("eventually draws more than one distinct vector (not narrowed to a single value)", () => {
    const seen = new Set(Array.from({ length: 200 }, () => pickVector()));
    expect(seen.size).toBeGreaterThan(1);
  });

  // Written as a loop over PRACTICE_VECTORS rather than one test per vector.
  // The hand-written version covered email, sms and voice, so when qr was added
  // it was neither honoured by pickVector nor caught here -- asking to practise
  // QR codes silently randomised the round instead.
  it.each([...PRACTICE_VECTORS])("honors an explicit '%s' preference every time", (vector) => {
    for (let i = 0; i < 50; i++) {
      expect(pickVector(vector)).toBe(vector);
    }
  });

  it("'mixed' preference behaves like the random draw, not a fixed vector", () => {
    const seen = new Set(Array.from({ length: 200 }, () => pickVector("mixed")));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("pickIsPhish", () => {
  it("always returns a boolean", () => {
    for (let i = 0; i < 200; i++) {
      expect(typeof pickIsPhish()).toBe("boolean");
    }
  });

  it("draws both true and false over many rounds (not always phishing)", () => {
    const seen = new Set(Array.from({ length: 200 }, () => pickIsPhish()));
    expect(seen.size).toBe(2);
  });

  it("draws evenly, so accuracy measures judgement rather than a guessing habit", () => {
    // This used to skew about 65/35 toward phishing, matching the static pool.
    // Measured over a simulated session the served mix came out at 60-63%, which
    // means a learner who answered "phishing" every round scored about 62%
    // without exercising any judgement at all. Real mail is mostly legitimate,
    // so an even draw is not realism -- it is the only ratio where an accuracy
    // figure means what it appears to mean.
    const draws = Array.from({ length: 2000 }, () => pickIsPhish());
    const phishRatio = draws.filter(Boolean).length / draws.length;
    expect(phishRatio).toBeGreaterThan(0.44);
    expect(phishRatio).toBeLessThan(0.56);
  });

  it("still produces both verdicts", () => {
    const draws = Array.from({ length: 200 }, () => pickIsPhish());
    expect(draws).toContain(true);
    expect(draws).toContain(false);
  });
});

describe("difficultyForAwarenessScore", () => {
  it.each([
    [0, 1],
    [0.1, 1],
    [0.19, 1],
    [0.2, 2],
    [0.3, 2],
    [0.39, 2],
    [0.4, 3],
    [0.5, 3],
    [0.64, 3],
    [0.65, 4],
    [0.7, 4],
    [0.84, 4],
    [0.85, 5],
    [0.95, 5],
    [1, 5],
  ])("maps awareness score %p to difficulty %p", (score, expected) => {
    expect(difficultyForAwarenessScore(score)).toBe(expected);
  });

  it("clamps out-of-range scores instead of returning something outside 1-5", () => {
    expect(difficultyForAwarenessScore(-5)).toBe(1);
    expect(difficultyForAwarenessScore(1.5)).toBe(5);
    expect(difficultyForAwarenessScore(Number.POSITIVE_INFINITY)).toBe(5);
    expect(difficultyForAwarenessScore(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it("falls back to the lowest difficulty for NaN rather than throwing", () => {
    expect(difficultyForAwarenessScore(Number.NaN)).toBe(1);
  });
});
