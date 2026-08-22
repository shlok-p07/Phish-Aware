/**
 * The scheduling arithmetic, kept pure so the intervals can be reasoned about.
 *
 * A cut-down SM-2. The full algorithm grades recall on a six-point scale; here a
 * learner either spotted the red flag or did not, so the grade is a boolean and
 * the ease factor carries everything else.
 *
 * The numbers matter more than the shape, so they are named and bounded:
 *
 * - A miss resets the interval to a day rather than shortening it, because
 *   something a learner has just got wrong is not "nearly learned".
 * - Ease is clamped. Without a floor, repeated misses drive it to nothing and the
 *   target is scheduled every day forever, which is how a review system turns
 *   into a punishment. Without a ceiling, two lucky answers push the next review
 *   past the point of usefulness.
 * - The first success is deliberately short. Getting something right once is weak
 *   evidence, and a learner who sees it again the next day and gets it right
 *   again has actually learned something.
 */
export const FIRST_INTERVAL_DAYS = 1;
export const SECOND_INTERVAL_DAYS = 3;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.6;
export const STARTING_EASE = 2.0;
const EASE_ON_SUCCESS = 0.1;
const EASE_ON_MISS = 0.25;
/** Consecutive successes before a target counts as mastered. */
export const MASTERY_STREAK = 3;
/** Never schedule further out than this: a year-old review is not a review. */
export const MAX_INTERVAL_DAYS = 120;

export interface ReviewSchedule {
  interval: number;
  easeFactor: number;
  streak: number;
  dueAt: Date;
}

const clampEase = (ease: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, ease));
const addDays = (from: Date, days: number) =>
  new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

/**
 * The schedule after one answer.
 *
 * `current` is null the first time a target is seen, which is the common case:
 * most targets enter the schedule because a learner has just missed one.
 */
export function nextSchedule(
  current: { interval: number; easeFactor: number; streak: number } | null,
  spotted: boolean,
  now = new Date(),
): ReviewSchedule {
  const ease = current?.easeFactor ?? STARTING_EASE;

  if (!spotted) {
    return {
      interval: FIRST_INTERVAL_DAYS,
      easeFactor: clampEase(ease - EASE_ON_MISS),
      streak: 0,
      dueAt: addDays(now, FIRST_INTERVAL_DAYS),
    };
  }

  const streak = (current?.streak ?? 0) + 1;
  const easeFactor = clampEase(ease + EASE_ON_SUCCESS);
  const interval =
    streak === 1
      ? FIRST_INTERVAL_DAYS
      : streak === 2
        ? SECOND_INTERVAL_DAYS
        : Math.min(MAX_INTERVAL_DAYS, Math.round((current?.interval ?? SECOND_INTERVAL_DAYS) * easeFactor));

  return { interval, easeFactor, streak, dueAt: addDays(now, interval) };
}

/** Whether a target is owed a review. */
export function isDue(review: { dueAt: Date }, now = new Date()): boolean {
  return review.dueAt.getTime() <= now.getTime();
}

/** Mastered means a run of successes, not a single lucky one. */
export function isMastered(review: { streak: number }): boolean {
  return review.streak >= MASTERY_STREAK;
}
