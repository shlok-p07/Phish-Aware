import { CUE_LABELS, type CueId } from "@/server/cues";
import { percent } from "@/lib/utils";

/**
 * One learner's performance, derived from their attempts.
 *
 * Extracted from the profile route so an admin can be shown the same picture for
 * a member of their organization. Computing it twice would eventually mean a
 * manager and the person they are managing seeing different numbers for the same
 * history, which is the sort of discrepancy that ends trust in a tool like this.
 *
 * Pure: attempts and the scenarios they reference in, numbers out. Every read is
 * the caller's problem, which is what lets one version serve a self view scoped
 * by session and an admin view scoped by organization.
 */
export interface AnalyticsAttempt {
  scenarioId: { toString(): string };
  caughtCues: string[];
  missedCues: string[];
  confidence: number;
  correct: boolean;
  createdAt: Date;
}

export type AnalyticsVector = "email" | "sms" | "voice" | "qr" | "social" | "web";

export interface LearnerAnalytics {
  cueAccuracy: { cueId: CueId; label: string; attempts: number; rate: number }[];
  vectorAccuracy: { vector: AnalyticsVector; attempts: number; rate: number }[];
  calibrationScore: number;
  progressOverTime: { date: Date; accuracyRate: number; attempts: number }[];
  totalAttempts: number;
}

export function computeLearnerAnalytics(
  attempts: AnalyticsAttempt[],
  vectorByScenarioId: Map<string, string>,
): LearnerAnalytics {
  const cueStats = new Map<string, { caught: number; missed: number }>();
  for (const attempt of attempts) {
    for (const cue of attempt.caughtCues) {
      const stat = cueStats.get(cue) ?? { caught: 0, missed: 0 };
      stat.caught++;
      cueStats.set(cue, stat);
    }
    for (const cue of attempt.missedCues) {
      const stat = cueStats.get(cue) ?? { caught: 0, missed: 0 };
      stat.missed++;
      cueStats.set(cue, stat);
    }
  }
  const cueAccuracy = [...cueStats.entries()].map(([cueId, stat]) => ({
    cueId: cueId as CueId,
    label: CUE_LABELS[cueId as CueId],
    attempts: stat.caught + stat.missed,
    rate: percent(stat.caught / (stat.caught + stat.missed)),
  }));

  const vectorStats = new Map<string, { correct: number; total: number }>();
  for (const attempt of attempts) {
    const vector = vectorByScenarioId.get(attempt.scenarioId.toString());
    // An attempt whose scenario has since been removed cannot be attributed to a
    // vector, and guessing one would put a wrong bar on somebody's profile.
    if (!vector) continue;
    const stat = vectorStats.get(vector) ?? { correct: 0, total: 0 };
    stat.total++;
    if (attempt.correct) stat.correct++;
    vectorStats.set(vector, stat);
  }
  const vectorAccuracy = [...vectorStats.entries()].map(([vector, stat]) => ({
    vector: vector as AnalyticsVector,
    attempts: stat.total,
    rate: percent(stat.correct / stat.total),
  }));

  // Confidence weighted by whether it was warranted: sure and right scores full,
  // sure and wrong scores nothing. Somebody confidently wrong is the most
  // dangerous learner in the building, and a bare accuracy figure hides them.
  const calibrations = attempts.map((attempt) => {
    const confidence = attempt.confidence / 100;
    return attempt.correct ? confidence : 1 - confidence;
  });
  const calibrationScore =
    calibrations.length > 0
      ? percent(calibrations.reduce((a, b) => a + b, 0) / calibrations.length)
      : 0;

  const dayStats = new Map<string, { correct: number; total: number }>();
  for (const attempt of attempts) {
    const day = attempt.createdAt.toISOString().slice(0, 10);
    const stat = dayStats.get(day) ?? { correct: 0, total: 0 };
    stat.total++;
    if (attempt.correct) stat.correct++;
    dayStats.set(day, stat);
  }
  const progressOverTime = [...dayStats.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, stat]) => ({
      date: new Date(date),
      accuracyRate: percent(stat.correct / stat.total),
      attempts: stat.total,
    }));

  return {
    cueAccuracy,
    vectorAccuracy,
    calibrationScore,
    progressOverTime,
    totalAttempts: attempts.length,
  };
}

/** The weakest cues first, for a view that exists to show where to intervene. */
export function weakestCues(analytics: LearnerAnalytics, limit = 3) {
  return [...analytics.cueAccuracy].sort((a, b) => a.rate - b.rate).slice(0, limit);
}
