import { describe, expect, it } from "bun:test";
import {
  ATTACK_TYPE_TACTICS,
  MIN_WEIGHTED_HISTORY,
  selectAttackProfile,
  taxonomyPerformanceAreas,
  weaknessWeight,
  type AttackProfileHistoryEntry,
} from "./attackProfileSelector";
import { DEPARTMENT_ATTACK_TYPES } from "./attackProfiles";

const NOW = new Date("2026-08-02T12:00:00Z");

function attempt(
  overrides: Partial<AttackProfileHistoryEntry> = {},
): AttackProfileHistoryEntry {
  return {
    correct: true,
    confidence: 50,
    attackType: "credential_harvesting",
    leversPresent: ["urgency"],
    createdAt: NOW,
    ...overrides,
  };
}

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

function seededRandom(seed = 42): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("selectAttackProfile", () => {
  it("uses cold start before enough classified history exists", () => {
    const decision = selectAttackProfile({
      department: "Finance",
      history: Array.from({ length: MIN_WEIGHTED_HISTORY - 1 }, () => attempt()),
      random: sequence(0, 0),
      now: NOW,
    });
    expect(decision.mode).toBe("cold_start");
    expect(DEPARTMENT_ATTACK_TYPES.Finance).toContain(decision.attackType);
    expect(ATTACK_TYPE_TACTICS[decision.attackType]).toContain(decision.persuasionTactic);
  });

  it("ignores historical rows that have no taxonomy snapshot", () => {
    const history = Array.from({ length: 20 }, () =>
      attempt({ attackType: undefined, leversPresent: undefined }),
    );
    expect(selectAttackProfile({ department: "IT", history, random: () => 0 }).mode).toBe(
      "cold_start",
    );
  });

  it("takes the exploration branch 30% of the time while respecting eligibility", () => {
    const history = Array.from({ length: MIN_WEIGHTED_HISTORY }, () => attempt());
    const decision = selectAttackProfile({
      department: "Finance",
      history,
      random: sequence(0.1, 0.99, 0.99),
      now: NOW,
    });
    expect(decision.mode).toBe("exploration");
    expect(DEPARTMENT_ATTACK_TYPES.Finance).toContain(decision.attackType);
    expect(ATTACK_TYPE_TACTICS[decision.attackType]).toContain(decision.persuasionTactic);
  });

  it("targets a repeatedly missed, overconfident attack more often", () => {
    const history = Array.from({ length: 5 }, () =>
      attempt({ correct: false, confidence: 90 }),
    );
    const random = seededRandom();
    const counts = new Map<string, number>();
    for (let index = 0; index < 1000; index++) {
      const decision = selectAttackProfile({ department: null, history, random, now: NOW });
      counts.set(decision.attackType, (counts.get(decision.attackType) ?? 0) + 1);
      expect(ATTACK_TYPE_TACTICS[decision.attackType]).toContain(decision.persuasionTactic);
    }
    const weakCount = counts.get("credential_harvesting") ?? 0;
    for (const attackType of DEPARTMENT_ATTACK_TYPES.Engineering.filter(
      (type) => type !== "credential_harvesting" && type !== "cloud_file_sharing_scam",
    )) {
      expect(weakCount).toBeGreaterThan(counts.get(attackType) ?? 0);
    }
  });

  it("never selects an attack type outside the user's department taxonomy", () => {
    const history = Array.from({ length: 10 }, () => attempt());
    const random = seededRandom(7);
    for (const department of Object.keys(DEPARTMENT_ATTACK_TYPES)) {
      for (let index = 0; index < 100; index++) {
        const decision = selectAttackProfile({ department, history, random, now: NOW });
        expect(DEPARTMENT_ATTACK_TYPES[department as keyof typeof DEPARTMENT_ATTACK_TYPES]).toContain(
          decision.attackType,
        );
      }
    }
  });
});

describe("weaknessWeight", () => {
  it("prioritizes incorrect and overconfident performance", () => {
    const strong = weaknessWeight(
      { attempts: 5, incorrect: 0, overconfidentErrors: 0, lastAttemptedAt: NOW },
      NOW,
    );
    const weak = weaknessWeight(
      { attempts: 5, incorrect: 5, overconfidentErrors: 5, lastAttemptedAt: NOW },
      NOW,
    );
    expect(weak).toBeGreaterThan(strong);
  });

  it("keeps unseen and long-unseen categories at a positive weight", () => {
    const unseen = weaknessWeight(
      { attempts: 0, incorrect: 0, overconfidentErrors: 0, lastAttemptedAt: null },
      NOW,
    );
    const recent = weaknessWeight(
      { attempts: 5, incorrect: 0, overconfidentErrors: 0, lastAttemptedAt: NOW },
      NOW,
    );
    expect(unseen).toBeGreaterThan(recent);
    expect(recent).toBeGreaterThan(0);
  });
});

describe("taxonomyPerformanceAreas", () => {
  it("reports attack and tactic accuracy from the same classified history", () => {
    const areas = taxonomyPerformanceAreas({
      department: null,
      now: NOW,
      history: [
        attempt({ correct: false, confidence: 90 }),
        attempt({ correct: true }),
      ],
    });
    expect(areas.find((area) => area.id === "credential_harvesting")).toMatchObject({
      category: "attack_type",
      attempts: 2,
      accuracyRate: 50,
      incorrect: 1,
    });
    expect(areas.find((area) => area.id === "urgency")).toMatchObject({
      category: "persuasion_tactic",
      attempts: 2,
      accuracyRate: 50,
      incorrect: 1,
    });
  });

  it("does not invent dashboard areas from unclassified legacy attempts", () => {
    const areas = taxonomyPerformanceAreas({
      department: "Finance",
      now: NOW,
      history: [attempt({ attackType: undefined, leversPresent: undefined })],
    });
    expect(areas).toEqual([]);
  });
});
