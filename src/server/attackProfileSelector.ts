import {
  ATTACK_TYPE_LABELS,
  eligibleAttackTypes,
  PERSUASION_TACTIC_LABELS,
  type AttackTypeId,
  type PersuasionTacticId,
} from "./attackProfiles";

export const MIN_WEIGHTED_HISTORY = 5;
export const EXPLORATION_RATE = 0.3;

/** Coherent tactic choices for each hard-coded attack taxonomy entry. */
export const ATTACK_TYPE_TACTICS: Record<AttackTypeId, PersuasionTacticId[]> = {
  credential_harvesting: ["urgency", "fear", "authority", "trust", "curiosity"],
  bec: ["authority", "trust", "urgency"],
  invoice_fraud: ["authority", "urgency", "fear", "scarcity"],
  payroll_fraud: ["authority", "trust", "urgency", "curiosity"],
  mfa_fatigue: ["fear", "urgency", "authority"],
  cloud_file_sharing_scam: ["trust", "curiosity", "authority", "urgency", "social_proof"],
  it_helpdesk_scam: ["authority", "trust", "urgency", "fear"],
  package_delivery_scam: ["curiosity", "urgency", "scarcity", "reward", "social_proof"],
  software_update_scam: ["authority", "fear", "urgency", "trust"],
  malware_delivery: ["curiosity", "fear", "urgency", "reward"],
};

export interface AttackProfileHistoryEntry {
  correct: boolean;
  confidence: number;
  leversPresent?: PersuasionTacticId[];
  attackType?: AttackTypeId;
  createdAt: Date;
}

export interface PerformanceStats {
  attempts: number;
  incorrect: number;
  overconfidentErrors: number;
  lastAttemptedAt: Date | null;
}

export interface AttackProfileDecision {
  persuasionTactic: PersuasionTacticId;
  attackType: AttackTypeId;
  /**
   * How the choice was made. "unprofiled" means the learner has not consented to
   * personalised persuasion weighting, so this was a department-level pick --
   * distinguishable from a cold start, which will become personalised once there
   * is history.
   */
  mode: "cold_start" | "exploration" | "weakness_targeting" | "unprofiled";
  tacticWeight: number;
  attackTypeWeight: number;
}

export interface TaxonomyPerformanceArea {
  id: AttackTypeId | PersuasionTacticId;
  category: "attack_type" | "persuasion_tactic";
  label: string;
  attempts: number;
  accuracyRate: number;
  weight: number;
  incorrect: number;
}

type SelectorOptions = {
  department: string | null;
  history: AttackProfileHistoryEntry[];
  random?: () => number;
  now?: Date;
  /**
   * Whether this learner's own history may be used to weight which persuasion
   * tactics they meet.
   *
   * Inferring which manipulations work on a specific person is exactly what a
   * consent record exists to cover, so it is refusable -- and refusing has to
   * mean something. Without it the selector uses the department's eligible set
   * and picks within it at random: the same material, chosen without a personal
   * profile. Defaults to false, because an absent decision is not permission.
   */
  personalised?: boolean;
};

const EMPTY_STATS = (): PerformanceStats => ({
  attempts: 0,
  incorrect: 0,
  overconfidentErrors: 0,
  lastAttemptedAt: null,
});

function addAttempt(stats: PerformanceStats, attempt: AttackProfileHistoryEntry): void {
  stats.attempts++;
  if (!attempt.correct) {
    stats.incorrect++;
    if (attempt.confidence >= 65) stats.overconfidentErrors++;
  }
  if (!stats.lastAttemptedAt || attempt.createdAt > stats.lastAttemptedAt) {
    stats.lastAttemptedAt = attempt.createdAt;
  }
}

/** Positive weight: weakness + overconfidence + underexposure + time since exposure. */
export function weaknessWeight(stats: PerformanceStats, now: Date): number {
  const errorRate = stats.attempts === 0 ? 0 : stats.incorrect / stats.attempts;
  const overconfidenceRate =
    stats.attempts === 0 ? 0 : stats.overconfidentErrors / stats.attempts;
  const exposureBonus = 2 / (stats.attempts + 1);
  const daysSince = stats.lastAttemptedAt
    ? Math.max(0, now.getTime() - stats.lastAttemptedAt.getTime()) / 86_400_000
    : 45;
  const recencyBonus = Math.min(1.5, daysSince / 30);
  return 1 + errorRate * 4 + overconfidenceRate * 2 + exposureBonus + recencyBonus;
}

function attackStats(history: AttackProfileHistoryEntry[]): Map<AttackTypeId, PerformanceStats> {
  const result = new Map<AttackTypeId, PerformanceStats>();
  for (const attempt of history) {
    if (!attempt.attackType) continue;
    const stats = result.get(attempt.attackType) ?? EMPTY_STATS();
    addAttempt(stats, attempt);
    result.set(attempt.attackType, stats);
  }
  return result;
}

function tacticStats(
  history: AttackProfileHistoryEntry[],
): Map<PersuasionTacticId, PerformanceStats> {
  const result = new Map<PersuasionTacticId, PerformanceStats>();
  for (const attempt of history) {
    for (const tactic of new Set(attempt.leversPresent ?? [])) {
      const stats = result.get(tactic) ?? EMPTY_STATS();
      addAttempt(stats, attempt);
      result.set(tactic, stats);
    }
  }
  return result;
}

/** Dashboard-ready taxonomy performance using the selector's exact weights. */
export function taxonomyPerformanceAreas({
  department,
  history,
  now = new Date(),
}: Pick<SelectorOptions, "department" | "history" | "now">): TaxonomyPerformanceArea[] {
  const attacks = eligibleAttackTypes(department);
  const tactics = Array.from(new Set(attacks.flatMap((attack) => ATTACK_TYPE_TACTICS[attack])));
  const byAttack = attackStats(history);
  const byTactic = tacticStats(history);

  const attackAreas = attacks.flatMap((id): TaxonomyPerformanceArea[] => {
    const stats = byAttack.get(id);
    if (!stats || stats.attempts === 0) return [];
    return [{
      id,
      category: "attack_type",
      label: ATTACK_TYPE_LABELS[id],
      attempts: stats.attempts,
      accuracyRate: Math.round(((stats.attempts - stats.incorrect) / stats.attempts) * 100),
      weight: weaknessWeight(stats, now),
      incorrect: stats.incorrect,
    }];
  });
  const tacticAreas = tactics.flatMap((id): TaxonomyPerformanceArea[] => {
    const stats = byTactic.get(id);
    if (!stats || stats.attempts === 0) return [];
    return [{
      id,
      category: "persuasion_tactic",
      label: PERSUASION_TACTIC_LABELS[id],
      attempts: stats.attempts,
      accuracyRate: Math.round(((stats.attempts - stats.incorrect) / stats.attempts) * 100),
      weight: weaknessWeight(stats, now),
      incorrect: stats.incorrect,
    }];
  });
  return [...attackAreas, ...tacticAreas];
}

function boundedRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999, Math.max(0, value));
}

function randomChoice<T>(items: T[], random: () => number): T {
  return items[Math.floor(boundedRandom(random) * items.length)]!;
}

function weightedChoice<T>(
  items: T[],
  weightFor: (item: T) => number,
  random: () => number,
): { item: T; weight: number } {
  const weighted = items.map((item) => ({ item, weight: Math.max(0.0001, weightFor(item)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = boundedRandom(random) * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor < 0) return entry;
  }
  return weighted[weighted.length - 1]!;
}

export function selectAttackProfile({
  department,
  history,
  random = Math.random,
  now = new Date(),
  personalised = false,
}: SelectorOptions): AttackProfileDecision {
  const attacks = eligibleAttackTypes(department);

  // No permission to profile means no profile: department-eligible material,
  // chosen without reference to what has worked on this person before. This is
  // the same path a brand-new learner takes, so it is a well-trodden one rather
  // than a degraded mode.
  if (!personalised) {
    const attackType = randomChoice(attacks, random);
    return {
      attackType,
      persuasionTactic: randomChoice(ATTACK_TYPE_TACTICS[attackType], random),
      mode: "unprofiled",
      tacticWeight: 0,
      attackTypeWeight: 0,
    };
  }

  const classifiedHistory = history.filter(
    (attempt) => attempt.attackType && (attempt.leversPresent?.length ?? 0) > 0,
  );
  const coldStart = classifiedHistory.length < MIN_WEIGHTED_HISTORY;
  const explore = !coldStart && boundedRandom(random) < EXPLORATION_RATE;

  if (coldStart || explore) {
    const attackType = randomChoice(attacks, random);
    const persuasionTactic = randomChoice(ATTACK_TYPE_TACTICS[attackType], random);
    return {
      attackType,
      persuasionTactic,
      mode: coldStart ? "cold_start" : "exploration",
      attackTypeWeight: 1,
      tacticWeight: 1,
    };
  }

  const byAttack = attackStats(classifiedHistory);
  const chosenAttack = weightedChoice(
    attacks,
    (attack) => weaknessWeight(byAttack.get(attack) ?? EMPTY_STATS(), now),
    random,
  );
  const byTactic = tacticStats(classifiedHistory);
  const chosenTactic = weightedChoice(
    ATTACK_TYPE_TACTICS[chosenAttack.item],
    (tactic) => weaknessWeight(byTactic.get(tactic) ?? EMPTY_STATS(), now),
    random,
  );

  return {
    attackType: chosenAttack.item,
    persuasionTactic: chosenTactic.item,
    mode: "weakness_targeting",
    attackTypeWeight: chosenAttack.weight,
    tacticWeight: chosenTactic.weight,
  };
}
