import { ObjectId } from "mongodb";
import { reviewsCollection, specDefaults, type ReviewDoc, type ReviewTargetType } from "@/db";
import { nextSchedule, isDue, isMastered, MASTERY_STREAK } from "./spacedReview";
import { CUE_LABELS, type CueId } from "./cues";
import { PERSUASION_TACTIC_LABELS } from "./attackProfiles";

/**
 * The persistence half of spaced review: turning one graded attempt into an
 * updated schedule, and reading back what a learner currently owes.
 *
 * Kept apart from the arithmetic in `spacedReview` so the intervals stay
 * testable without a database, and apart from the attempt route so that route
 * does not grow a fourth responsibility.
 */

/** One thing the learner was tested on, and whether they got it. */
export interface ReviewOutcome {
  targetType: ReviewTargetType;
  targetValue: string;
  spotted: boolean;
}

/**
 * Which targets an attempt exercised.
 *
 * Red flags are graded individually -- `caughtCues` and `missedCues` come
 * straight from grading, so each is its own outcome. Levers and the channel are
 * not individually graded; the only signal available is whether the learner
 * called the whole scenario correctly, so the verdict stands in for all of them.
 * That is weaker evidence, which is fine: it moves the schedule in the right
 * direction, and a wrong verdict on an urgency-driven scenario is genuinely a
 * reason to show them urgency again sooner.
 *
 * `falseCues` are deliberately not scheduled. Flagging a red flag that was not
 * there is an over-reporting error, and rehearsing the same cue is the opposite
 * of the correction needed.
 */
export function outcomesForAttempt(attempt: {
  correct: boolean;
  caughtCues: readonly string[];
  missedCues: readonly string[];
  leversPresent?: readonly string[];
  vector?: string | null;
}): ReviewOutcome[] {
  const outcomes: ReviewOutcome[] = [
    ...attempt.caughtCues.map((c) => ({ targetType: "cueType" as const, targetValue: c, spotted: true })),
    ...attempt.missedCues.map((c) => ({ targetType: "cueType" as const, targetValue: c, spotted: false })),
    ...(attempt.leversPresent ?? []).map((l) => ({
      targetType: "emotionalLever" as const,
      targetValue: l,
      spotted: attempt.correct,
    })),
  ];
  if (attempt.vector) {
    outcomes.push({ targetType: "vector", targetValue: attempt.vector, spotted: attempt.correct });
  }
  // A scenario can list the same lever twice; last write would otherwise
  // silently win with a different result.
  const seen = new Set<string>();
  return outcomes.filter((o) => {
    const key = `${o.targetType}:${o.targetValue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Advances the schedule for every target an attempt touched.
 *
 * Read-then-write per target rather than a transaction: two attempts from one
 * learner landing at the same instant could interleave, and the cost of that is
 * one interval computed from slightly stale state -- self-correcting on the next
 * answer. A transaction to protect interval arithmetic would be a lot of
 * machinery for an error that does not accumulate.
 *
 * Never throws into the caller. A review schedule failing to update must not
 * cost a learner the attempt they just submitted, so a failure here is reported
 * and swallowed exactly like audit logging.
 */
export async function applyReviewOutcomes(
  userId: ObjectId,
  orgId: ObjectId | null,
  outcomes: readonly ReviewOutcome[],
  now = new Date(),
): Promise<void> {
  if (outcomes.length === 0) return;
  try {
    const reviews = await reviewsCollection();
    const existing = await reviews
      .find({ userId, $or: outcomes.map((o) => ({ targetType: o.targetType, targetValue: o.targetValue })) })
      .toArray();
    const byKey = new Map(existing.map((r) => [`${r.targetType}:${r.targetValue}`, r]));

    // updatedAt is deliberately excluded from the insert-only fields: MongoDB
    // rejects the whole update if a path appears in both $set and $setOnInsert.
    const { updatedAt: _updatedAt, ...insertOnlyDefaults } = specDefaults(now);

    const operations = outcomes.map((outcome) => {
      const current = byKey.get(`${outcome.targetType}:${outcome.targetValue}`) ?? null;
      const schedule = nextSchedule(current, outcome.spotted, now);
      const id = current?._id ?? new ObjectId();
      return {
        updateOne: {
          filter: { userId, targetType: outcome.targetType, targetValue: outcome.targetValue },
          update: {
            $set: {
              ...schedule,
              lastReviewedAt: now,
              orgId,
              updatedAt: now,
            },
            $setOnInsert: {
              ...insertOnlyDefaults,
              _id: id,
              reviewId: id,
              userId,
              targetType: outcome.targetType,
              targetValue: outcome.targetValue,
            },
          },
          upsert: true,
        },
      };
    });

    await reviews.bulkWrite(operations);
  } catch (cause) {
    console.error("[review] failed to update schedule", cause);
  }
}

/** Every schedule row for a learner, newest-due first. */
async function reviewsForUser(userId: ObjectId): Promise<ReviewDoc[]> {
  const reviews = await reviewsCollection();
  return reviews.find({ userId }).toArray();
}

/**
 * The red flags a learner owes practice on, worst first.
 *
 * Feeds `focusCues` in scenario selection, which is the whole point of keeping a
 * schedule: something missed a fortnight ago comes back on its own instead of
 * waiting for chance to resurface it. Ordered by ease factor ascending so the
 * cue they have struggled with most is the one selection tries hardest to place.
 */
export async function dueCues(userId: ObjectId, now = new Date(), limit = 3): Promise<CueId[]> {
  const reviews = await reviewsForUser(userId);
  const known = new Set<string>(Object.keys(CUE_LABELS));
  return reviews
    .filter((r) => r.targetType === "cueType" && isDue(r, now) && known.has(r.targetValue))
    .sort((a, b) => a.easeFactor - b.easeFactor || a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, limit)
    .map((r) => r.targetValue as CueId);
}

const VECTOR_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  voice: "Voice call",
  qr: "QR code",
  social: "Social DM",
  web: "Web page",
};

/**
 * A target's display name.
 *
 * Falls back to humanising the stored value rather than returning it raw or
 * throwing: a schedule row can outlive the taxonomy entry it was written
 * against, and "Sender domain" is a better outcome for a retired cue id than
 * either `sender_domain` on screen or a 500.
 */
export function reviewTargetLabel(targetType: ReviewTargetType, targetValue: string): string {
  const known =
    targetType === "cueType"
      ? CUE_LABELS[targetValue as CueId]
      : targetType === "emotionalLever"
        ? PERSUASION_TACTIC_LABELS[targetValue as keyof typeof PERSUASION_TACTIC_LABELS]
        : VECTOR_LABELS[targetValue];
  if (known) return known;
  const humanised = targetValue.replace(/[_-]+/g, " ").trim();
  return humanised ? humanised[0]!.toUpperCase() + humanised.slice(1) : targetValue;
}

/** One tracked target, with enough detail to show progress toward mastery. */
export interface ReviewTargetProgress {
  label: string;
  targetType: ReviewTargetType;
  /** Consecutive successes so far. */
  streak: number;
  mastered: boolean;
  due: boolean;
}

export interface ReviewSummary {
  /** Targets on a run of successes -- what the learner has actually banked. */
  mastered: number;
  /** Targets owed practice right now. */
  due: number;
  /** Everything being tracked, mastered or not. */
  tracked: number;
  /** When the next non-due target comes back, if nothing is due. */
  nextDueAt: Date | null;
  /** Mastered target labels, for showing the learner what they earned. */
  masteredTargets: string[];
  /** Due target labels, worst first. */
  dueTargets: string[];
  /** How many successes in a row mastery takes, so the UI need not hardcode it. */
  masteryStreak: number;
  /**
   * Every tracked target with its streak, strongest first.
   *
   * Counts alone made the feature look broken. Mastery takes three correct
   * answers in a row and reviews are scheduled a day out, so a learner who had
   * just practised saw "0 mastered" and "nothing due" and reasonably concluded
   * nothing was happening. Showing 2 of 3 on a named red flag is the difference
   * between invisible progress and a reason to come back.
   */
  targets: ReviewTargetProgress[];
}

/**
 * What to show a learner about their own retention.
 *
 * Deliberately counts mastered targets rather than raw accuracy: accuracy over
 * a whole history barely moves after a few dozen attempts, so it stops being
 * feedback. "Four red flags banked, two coming back up" changes every session
 * and is the thing worth returning for.
 */
export async function reviewSummary(userId: ObjectId, now = new Date()): Promise<ReviewSummary> {
  const reviews = await reviewsForUser(userId);
  const mastered = reviews.filter(isMastered);
  const due = reviews.filter((r) => isDue(r, now)).sort((a, b) => a.easeFactor - b.easeFactor);
  const upcoming = reviews
    .filter((r) => !isDue(r, now))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  const targets: ReviewTargetProgress[] = [...reviews]
    // Closest to mastery first: that is the one worth showing at the top.
    .sort((a, b) => b.streak - a.streak || a.targetValue.localeCompare(b.targetValue))
    .map((r) => ({
      label: reviewTargetLabel(r.targetType, r.targetValue),
      targetType: r.targetType,
      streak: r.streak,
      mastered: isMastered(r),
      due: isDue(r, now),
    }));

  return {
    mastered: mastered.length,
    due: due.length,
    tracked: reviews.length,
    targets,
    nextDueAt: upcoming[0]?.dueAt ?? null,
    masteredTargets: mastered.map((r) => reviewTargetLabel(r.targetType, r.targetValue)),
    dueTargets: due.map((r) => reviewTargetLabel(r.targetType, r.targetValue)),
    masteryStreak: MASTERY_STREAK,
  };
}
