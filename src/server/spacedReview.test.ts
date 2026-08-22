import { describe, expect, test } from "bun:test";
import {
  nextSchedule,
  isDue,
  isMastered,
  MIN_EASE,
  MAX_EASE,
  STARTING_EASE,
  FIRST_INTERVAL_DAYS,
  SECOND_INTERVAL_DAYS,
  MAX_INTERVAL_DAYS,
  MASTERY_STREAK,
} from "./spacedReview";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const daysBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 86_400_000;

describe("nextSchedule", () => {
  test("a first miss schedules the target for tomorrow", () => {
    const s = nextSchedule(null, false, NOW);
    expect(s.interval).toBe(FIRST_INTERVAL_DAYS);
    expect(s.streak).toBe(0);
    expect(daysBetween(NOW, s.dueAt)).toBe(FIRST_INTERVAL_DAYS);
  });

  test("a miss resets the interval rather than shortening it", () => {
    // Something a learner has just got wrong is not "nearly learned", however
    // long the schedule had grown.
    const mature = { interval: 60, easeFactor: 2.4, streak: 5 };
    expect(nextSchedule(mature, false, NOW).interval).toBe(FIRST_INTERVAL_DAYS);
  });

  test("a miss lowers ease, so a repeatedly-missed target keeps coming back", () => {
    const first = nextSchedule(null, false, NOW);
    const second = nextSchedule(first, false, NOW);
    expect(second.easeFactor).toBeLessThan(first.easeFactor);
  });

  test("ease never falls below the floor, however many misses", () => {
    // Without a floor the target is scheduled every day forever, which turns
    // review into punishment.
    let state = nextSchedule(null, false, NOW);
    for (let i = 0; i < 50; i++) state = nextSchedule(state, false, NOW);
    expect(state.easeFactor).toBe(MIN_EASE);
  });

  test("ease never rises above the ceiling, however many successes", () => {
    let state = nextSchedule(null, true, NOW);
    for (let i = 0; i < 50; i++) state = nextSchedule(state, true, NOW);
    expect(state.easeFactor).toBe(MAX_EASE);
  });

  test("the first success is short: getting it right once is weak evidence", () => {
    const s = nextSchedule(null, true, NOW);
    expect(s.interval).toBe(FIRST_INTERVAL_DAYS);
    expect(s.streak).toBe(1);
  });

  test("intervals grow across a run of successes", () => {
    const one = nextSchedule(null, true, NOW);
    const two = nextSchedule(one, true, NOW);
    const three = nextSchedule(two, true, NOW);
    expect(two.interval).toBe(SECOND_INTERVAL_DAYS);
    expect(three.interval).toBeGreaterThan(two.interval);
    expect(three.streak).toBe(3);
  });

  test("intervals are capped: a year-old review is not a review", () => {
    let state = nextSchedule(null, true, NOW);
    for (let i = 0; i < 40; i++) state = nextSchedule(state, true, NOW);
    expect(state.interval).toBe(MAX_INTERVAL_DAYS);
    expect(daysBetween(NOW, state.dueAt)).toBe(MAX_INTERVAL_DAYS);
  });

  test("dueAt always matches the interval it reports", () => {
    // The two are written to the same document; a mismatch would schedule
    // something other than what the row claims.
    let state = nextSchedule(null, true, NOW);
    for (let i = 0; i < 10; i++) {
      state = nextSchedule(state, i % 3 !== 0, NOW);
      expect(daysBetween(NOW, state.dueAt)).toBe(state.interval);
    }
  });

  test("an unseen target starts at the neutral ease", () => {
    expect(nextSchedule(null, true, NOW).easeFactor).toBeCloseTo(STARTING_EASE + 0.1, 10);
  });

  test("recovering after a miss takes the full streak again", () => {
    const missed = nextSchedule(null, false, NOW);
    expect(isMastered(missed)).toBe(false);
    let state = missed;
    for (let i = 0; i < MASTERY_STREAK; i++) state = nextSchedule(state, true, NOW);
    expect(isMastered(state)).toBe(true);
  });
});

describe("isDue", () => {
  test("a target due in the past is owed", () => {
    expect(isDue({ dueAt: new Date(NOW.getTime() - 1000) }, NOW)).toBe(true);
  });

  test("a target due exactly now is owed", () => {
    expect(isDue({ dueAt: NOW }, NOW)).toBe(true);
  });

  test("a target due later is not", () => {
    expect(isDue({ dueAt: new Date(NOW.getTime() + 1000) }, NOW)).toBe(false);
  });
});

describe("isMastered", () => {
  test("mastery needs a run, not one lucky answer", () => {
    expect(isMastered({ streak: MASTERY_STREAK - 1 })).toBe(false);
    expect(isMastered({ streak: MASTERY_STREAK })).toBe(true);
  });
});
