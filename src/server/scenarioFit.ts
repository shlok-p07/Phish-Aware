/**
 * Which pooled scenario to serve, and how hard it should be.
 *
 * This sits *after* the adaptive rules engine in `attackProfileSelector.ts`,
 * and deliberately does not overlap with it. That module decides which attack
 * type and persuasion tactic the learner should meet next, weighting by
 * weakness, overconfidence, underexposure and time since last seen, with a cold
 * start and controlled exploration. It answers "what kind of attack".
 *
 * Two questions it does not answer:
 *
 *   1. **How hard.** Difficulty was previously derived from the onboarding
 *      awareness score and never revisited, so a learner who improved kept
 *      being served the level they started at. It was also passed to the
 *      generator but never used to *select*, so the level of a pooled scenario
 *      was effectively arbitrary.
 *   2. **Which specific scenario.** An unattempted scenario could be served
 *      again on every refresh until someone completed it, which reads as the
 *      generator repeating itself.
 *
 * Weakness targeting is intentionally absent here. The rules engine already
 * does it, and two systems optimising the same objective is worse than one.
 */

/** A pooled scenario, reduced to what fit scoring needs. */
export interface Candidate {
  id: string;
  /** 1 (obvious) to 5 (subtle), per the shared spec. */
  difficulty: number;
  isPhish: boolean;
  /** The cues this scenario actually carries, for a cue-focused campaign. */
  cues?: string[];
}

/** One past attempt, newest first in the arrays passed below. */
export interface HistoryEntry {
  scenarioId: string;
  correct: boolean;
  isPhish: boolean;
  /**
   * The difficulty that was actually served, 1-5. The controller steps from
   * where the learner is rather than recomputing a level from scratch, which is
   * what stops it snapping between bands.
   */
  difficulty?: number;
}

export interface SelectionOptions {
  /** Fallback level before there is enough history to judge. 1-5. */
  startingDifficulty: number;
  /**
   * A floor the adaptive target cannot go below, from an assigned campaign.
   *
   * A campaign that asks for level 4 is a requirement, so it has to reach
   * selection and not only generation -- otherwise the engine keeps serving the
   * learner's comfortable level and the requirement is discharged on material
   * they never met. Defaults to 1, which is no constraint.
   */
  minDifficulty?: number;
  /**
   * Cues an assigned campaign is about.
   *
   * Steering by vector and level alone was not enough: a campaign asking for
   * lookalike domains kept being served scenarios that did not carry that cue,
   * so the practice was on the right channel at the right level and still could
   * not satisfy the requirement. A learner would have practised indefinitely at
   * 0 of 2.
   */
  focusCues?: string[];
  /**
   * Red flags the learner's own review schedule says are due.
   *
   * Distinct from focusCues: a campaign is an obligation and this is a need, so
   * they are weighted differently and must not be able to substitute for each
   * other. See WEIGHT.missesReviewCue.
   */
  reviewCues?: string[];
  /** Injected for deterministic tests; defaults to Math.random. */
  rng?: () => number;
}

/** How many recent attempts inform the difficulty estimate. */
export const PERFORMANCE_WINDOW = 8;
/** Below this many attempts we cannot judge, so the onboarding level stands. */
export const MIN_HISTORY_FOR_ADAPTION = 3;
/** Consecutive correct answers that force a step up regardless of the average. */
export const ESCALATION_STREAK = 3;
/** Recent attempts checked for repeats. */
export const RECENCY_WINDOW = 10;

/**
 * The band the controller aims to keep a learner inside.
 *
 * Above the ceiling the material is too easy to be interesting; below the floor
 * it stops teaching and starts demoralising. Aiming for a *success rate* rather
 * than for maximum difficulty is the whole difference between a learner who
 * stays and one who either coasts or gives up: the previous banded rule sent
 * anyone at 90% straight to level 5 and left them there, so a strong learner and
 * a very strong learner had identical, capped experiences.
 */
export const STEP_UP_ABOVE = 0.85;
export const STEP_DOWN_BELOW = 0.6;

/** How many recent scenarios the phish/legitimate mix is balanced over. */
export const BALANCE_WINDOW = 6;

/**
 * Scoring weights. Named rather than inlined because their *relative* sizes are
 * the design: level fit has to outrank recency, or a learner gets material at
 * the wrong difficulty purely to avoid a repeat.
 */
export const WEIGHT = {
  /** Cost per level of distance from target. Dominant term, by design. */
  levelMismatch: 5,
  /** Cost per position of recency for a scenario already seen. */
  repeat: 2,
  /**
   * Cost for pushing the recent verdict mix further from even, per point of
   * imbalance. Replaces a flat penalty that only fired after three identical
   * verdicts in a row: the served mix was 62% phishing, so answering "phishing"
   * every time scored 62% and accuracy barely measured judgement at all.
   */
  imbalance: 9,
  /**
   * Cost for a candidate that cannot satisfy the campaign a learner is on.
   * Larger than two levels of mismatch, because a round on a scenario that
   * cannot count is a round wasted rather than merely mistargeted.
   */
  missesFocusCue: 12,
  /**
   * Cost for a candidate that rehearses none of the red flags the learner
   * currently owes a review on.
   *
   * Half the campaign weight, deliberately. Review is what the learner needs;
   * a campaign is what they are required to do, and a required round must never
   * lose to a helpful one. Kept as a separate term rather than folded into
   * focusCues because that check is an "any of" -- one shared list would let a
   * scenario satisfy a mandatory campaign by carrying an unrelated review cue.
   */
  missesReviewCue: 6,
} as const;

const clampLevel = (n: number) => Math.max(1, Math.min(5, n));

/**
 * Exponentially weighted accuracy over the recent window, newest first, so a
 * learner who has just improved is not held back by attempts from last week.
 */
function weightedAccuracy(history: readonly HistoryEntry[]): number {
  const recent = history.slice(0, PERFORMANCE_WINDOW);
  let num = 0;
  let den = 0;
  recent.forEach((h, i) => {
    const w = Math.pow(0.8, i);
    den += w;
    if (h.correct) num += w;
  });
  return den === 0 ? 0 : num / den;
}

/** Where the learner is now: the difficulty last served, if we know it. */
function currentLevel(history: readonly HistoryEntry[], fallback: number): number {
  const served = history.find((h) => typeof h.difficulty === "number");
  return clampLevel(served?.difficulty ?? fallback);
}

/**
 * The level this learner should be working at now.
 *
 * A staircase, not a lookup. Recent accuracy decides whether to step up, hold or
 * step down, and a step is one level -- so difficulty tracks a learner instead
 * of snapping to whatever band their average happens to land in.
 *
 * The previous rule mapped accuracy straight onto a level and added a bonus step
 * for any three-in-a-row. In simulation that put a 0.95-skill learner and a
 * 0.80-skill learner in exactly the same place -- both pinned at level 5 for 30%
 * of rounds, both at 78% accuracy -- because it optimised for difficulty rather
 * than for keeping anybody in a band where they are still learning. Holding
 * inside the band is the common case now, which is what makes progress feel
 * earned rather than arbitrary.
 */
export function targetDifficulty(
  history: readonly HistoryEntry[],
  startingDifficulty: number,
): number {
  if (history.length < MIN_HISTORY_FOR_ADAPTION) return clampLevel(startingDifficulty);

  const accuracy = weightedAccuracy(history);
  const current = currentLevel(history, startingDifficulty);

  // A clean run steps up even if the weighted average has not caught up yet, so
  // somebody who has just clicked does not have to wait out their own history.
  const streak = history.slice(0, ESCALATION_STREAK);
  const cleanStreak =
    streak.length === ESCALATION_STREAK && streak.every((h) => h.correct);

  if (accuracy >= STEP_UP_ABOVE || cleanStreak) return clampLevel(current + 1);
  if (accuracy <= STEP_DOWN_BELOW) return clampLevel(current - 1);
  return current;
}

export interface ScoredCandidate {
  candidate: Candidate;
  score: number;
}

/**
 * Score every candidate. Higher is better. Exported so the reasoning is
 * inspectable from tests rather than only observable through the final pick.
 */
export function scoreCandidates(
  candidates: readonly Candidate[],
  history: readonly HistoryEntry[],
  opts: SelectionOptions,
): ScoredCandidate[] {
  const { startingDifficulty, minDifficulty = 1, focusCues = [], reviewCues = [] } = opts;
  const target = Math.max(targetDifficulty(history, startingDifficulty), clampLevel(minDifficulty));
  const recent = history.slice(0, RECENCY_WINDOW);

  const seenAt = new Map<string, number>();
  recent.forEach((h, i) => {
    if (!seenAt.has(h.scenarioId)) seenAt.set(h.scenarioId, i);
  });

  // How far the recent mix has drifted from even, signed: positive means too
  // much phishing lately, negative too much legitimate mail.
  const window = history.slice(0, BALANCE_WINDOW);
  const phishSeen = window.filter((h) => h.isPhish).length;
  const drift = window.length === 0 ? 0 : (2 * phishSeen - window.length) / window.length;

  return candidates.map((c) => {
    // Pull hard toward the target level. Dominant term.
    let score = -Math.abs(c.difficulty - target) * WEIGHT.levelMismatch;

    // Penalise anything seen recently, more sharply the more recent it was.
    const seen = seenAt.get(c.id);
    if (seen !== undefined) score -= (RECENCY_WINDOW - seen) * WEIGHT.repeat;

    // Push back toward an even mix, proportionally. A learner who can score by
    // answering "phishing" every time is not being measured on judgement, and a
    // run of either kind reads as the generator repeating itself.
    const pullsFurther = c.isPhish ? drift : -drift;
    if (pullsFurther > 0) score -= pullsFurther * WEIGHT.imbalance;

    // Prefer something that can actually count toward the campaign.
    if (focusCues.length > 0) {
      const carries = (c.cues ?? []).some((cue) => focusCues.includes(cue));
      if (!carries) score -= WEIGHT.missesFocusCue;
    }

    // Then toward whatever their review schedule says is coming back up.
    if (reviewCues.length > 0) {
      const rehearses = (c.cues ?? []).some((cue) => reviewCues.includes(cue));
      if (!rehearses) score -= WEIGHT.missesReviewCue;
    }

    return { candidate: c, score };
  });
}

/**
 * Pick the next scenario. Ties are broken randomly so two learners in the same
 * state do not march through the pool in lockstep.
 */
export function selectScenario(
  candidates: readonly Candidate[],
  history: readonly HistoryEntry[],
  opts: SelectionOptions,
): Candidate | null {
  if (candidates.length === 0) return null;
  const rng = opts.rng ?? Math.random;
  const scored = scoreCandidates(candidates, history, opts);
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best);
  return top[Math.floor(rng() * top.length)]!.candidate;
}
