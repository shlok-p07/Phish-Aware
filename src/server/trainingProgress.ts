import type { ObjectId } from "mongodb";

/**
 * How far through an assignment somebody is.
 *
 * Shared between the employee's own view (GET /api/training) and the admin's
 * campaign detail (GET /api/org/training/[id]) so the two cannot disagree about
 * whether a person has finished -- an admin chasing somebody the app has already
 * told is done would be worse than no view at all.
 *
 * Counted from practice attempts recorded since the assignment was created,
 * because nothing writes the stored `progress` field. Only practice after the
 * assignment counts: crediting earlier work would let an active learner complete
 * a brand-new requirement without doing anything.
 */
export type AssignmentStatus = "assigned" | "in_progress" | "completed" | "overdue";

/** What a campaign asks for. Null means any practice counts. */
export interface Focus {
  vectors: string[];
  minDifficulty: number;
  cues: string[];
}

/** An attempt, with the properties a focus is judged against. */
export interface QualifyingAttempt {
  createdAt: Date;
  /** The vector of the scenario attempted, if it is still resolvable. */
  vector?: string;
  /** Its difficulty, 1-5. */
  difficulty?: number;
  /** Cues the scenario actually carried. */
  cues?: string[];
}

/**
 * Whether one attempt counts toward a focused campaign.
 *
 * An unresolvable property fails the check it is missing rather than passing it.
 * A deleted scenario should not quietly discharge an obligation -- if we cannot
 * show the practice was on the right material, it does not count.
 */
export function attemptQualifies(attempt: QualifyingAttempt, focus: Focus | null): boolean {
  if (!focus) return true;
  if (focus.vectors.length > 0 && (!attempt.vector || !focus.vectors.includes(attempt.vector))) {
    return false;
  }
  if (focus.minDifficulty > 1) {
    if (typeof attempt.difficulty !== "number" || attempt.difficulty < focus.minDifficulty) {
      return false;
    }
  }
  if (focus.cues.length > 0) {
    const carried = attempt.cues ?? [];
    if (!focus.cues.some((cue) => carried.includes(cue))) return false;
  }
  return true;
}

/** Human wording for a focus, shared so admin and employee read the same thing. */
export function describeFocus(focus: Focus | null): string {
  if (!focus) return "Any practice counts";
  const parts: string[] = [];
  if (focus.vectors.length > 0) parts.push(focus.vectors.join(", "));
  if (focus.minDifficulty > 1) parts.push(`level ${focus.minDifficulty}+`);
  if (focus.cues.length > 0) {
    parts.push(`${focus.cues.length} specific ${focus.cues.length === 1 ? "red flag" : "red flags"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Any practice counts";
}

export interface ProgressInput {
  /** When the assignment was created. */
  assignedAt: Date;
  /** How many scenarios the campaign asks for. 0 means no requirement. */
  requiredScenarios: number;
  /** The campaign deadline, if it has one. */
  dueDate: Date | null;
  /** Every attempt by this person, in any order. */
  attempts: QualifyingAttempt[];
  /** What the campaign asks for. Null means any practice counts. */
  focus?: Focus | null;
  /**
   * Lessons the campaign asks the member to read, and how many they have.
   *
   * Campaigns could always name lessonIds, but progress counted scenarios only,
   * so a reading assignment could never reach completion. An assignment is done
   * when both halves are.
   */
  requiredLessons?: number;
  completedLessons?: number;
  /** Defaults to now; injectable so tests are not clock-dependent. */
  now?: Date;
}

export interface Progress {
  completedScenarios: number;
  completedLessons: number;
  requiredLessons: number;
  status: AssignmentStatus;
}

export function assignmentProgress(input: ProgressInput): Progress {
  const now = (input.now ?? new Date()).getTime();
  const since = input.assignedAt.getTime();
  const required = input.requiredScenarios;
  const focus = input.focus ?? null;
  const done = input.attempts.filter(
    (a) => a.createdAt.getTime() >= since && attemptQualifies(a, focus),
  ).length;

  const completedScenarios = required > 0 ? Math.min(done, required) : done;

  const requiredLessons = input.requiredLessons ?? 0;
  const completedLessons = Math.min(input.completedLessons ?? 0, requiredLessons);
  const scenariosDone = required === 0 || done >= required;
  const lessonsDone = requiredLessons === 0 || completedLessons >= requiredLessons;

  // An assignment with neither requirement has nothing to finish, so it stays
  // open rather than reporting itself complete the moment it is created.
  const finished = (required > 0 || requiredLessons > 0) && scenariosDone && lessonsDone;
  // Finished beats overdue: a past deadline on completed work is not a debt.
  const overdue = !finished && input.dueDate !== null && input.dueDate.getTime() < now;

  // Reading counts as having started, not just answering scenarios.
  const started = done > 0 || completedLessons > 0;

  return {
    completedScenarios,
    completedLessons,
    requiredLessons,
    status: finished ? "completed" : overdue ? "overdue" : started ? "in_progress" : "assigned",
  };
}

/** Groups attempts by user so a campaign of N members is one pass, not N queries. */
export function attemptsByUser<T extends { userId: ObjectId }>(
  attempts: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const attempt of attempts) {
    const key = attempt.userId.toString();
    const list = grouped.get(key);
    if (list) list.push(attempt);
    else grouped.set(key, [attempt]);
  }
  return grouped;
}
