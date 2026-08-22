import { describe, it, expect } from "bun:test";
import {
  targetDifficulty,
  scoreCandidates,
  selectScenario,
  MIN_HISTORY_FOR_ADAPTION,
  type Candidate,
  type HistoryEntry,
} from "./scenarioFit";

function cand(id: string, difficulty: number, isPhish = true, cues: string[] = []): Candidate {
  return { id, difficulty, isPhish, cues };
}
function attempt(
  scenarioId: string,
  correct: boolean,
  isPhish = true,
  difficulty?: number,
): HistoryEntry {
  return { scenarioId, correct, isPhish, difficulty };
}
const times = (n: number, f: (i: number) => HistoryEntry) => Array.from({ length: n }, (_, i) => f(i));
const first = () => 0; // deterministic rng: always take the first of the tied best

describe("targetDifficulty", () => {
  it("uses the onboarding level until there is enough history to judge", () => {
    expect(targetDifficulty([], 2)).toBe(2);
    expect(targetDifficulty([attempt("a", true), attempt("b", true)], 4)).toBe(4);
  });

  it("clamps an out-of-range onboarding level into 1-5", () => {
    expect(targetDifficulty([], 0)).toBe(1);
    expect(targetDifficulty([], 99)).toBe(5);
  });

  it("steps down one level for a learner who is struggling, rather than to the floor", () => {
    // The old rule mapped accuracy straight onto a band, so three wrong answers
    // sent somebody from level 5 to level 1 in a single round. One step keeps
    // the change legible and recoverable.
    const wrong = times(MIN_HISTORY_FOR_ADAPTION, (i) => attempt(`s${i}`, false, true, 5));
    expect(targetDifficulty(wrong, 5)).toBe(4);
  });

  it("steps down from where the learner actually was, not from the onboarding level", () => {
    const wrong = times(4, (i) => attempt(`s${i}`, false, true, 2));
    expect(targetDifficulty(wrong, 5)).toBe(1);
  });

  it("steps a consistently correct learner up one level at a time", () => {
    const right = (level: number) => times(8, (i) => attempt(`s${i}`, true, true, level));
    expect(targetDifficulty(right(1), 1)).toBe(2);
    expect(targetDifficulty(right(3), 3)).toBe(4);
  });

  it("tops out at the hardest level rather than overshooting it", () => {
    const right = times(8, (i) => attempt(`s${i}`, true, true, 5));
    expect(targetDifficulty(right, 5)).toBe(5);
  });

  it("holds inside the productive band instead of chasing difficulty", () => {
    // Around 70% is where somebody is still being taught. The previous rule
    // treated that as a reason to move; holding is the common case now, which is
    // what stops the level oscillating under a learner.
    const mixed = [
      attempt("a", true, true, 3),
      attempt("b", true, true, 3),
      attempt("c", false, true, 3),
      attempt("d", true, true, 3),
      attempt("e", false, true, 3),
      attempt("f", true, true, 3),
    ];
    expect(targetDifficulty(mixed, 3)).toBe(3);
  });

  it("steps up for three correct in a row even when the average is middling", () => {
    // Newest first: 3 correct, then a run of failures dragging the average down.
    const h = [...times(3, (i) => attempt(`r${i}`, true)), ...times(5, (i) => attempt(`w${i}`, false))];
    const withStreak = targetDifficulty(h, 3);
    const noStreak = targetDifficulty([attempt("x", false), ...h.slice(1)], 3);
    expect(withStreak).toBeGreaterThan(noStreak);
  });

  it("weights recent attempts above older ones", () => {
    const improving = [...times(4, (i) => attempt(`new${i}`, true)), ...times(4, (i) => attempt(`old${i}`, false))];
    const declining = [...times(4, (i) => attempt(`new${i}`, false)), ...times(4, (i) => attempt(`old${i}`, true))];
    expect(targetDifficulty(improving, 3)).toBeGreaterThan(targetDifficulty(declining, 3));
  });

  it("never leaves the 1-5 range however strong the run", () => {
    const right = times(20, (i) => attempt(`s${i}`, true));
    expect(targetDifficulty(right, 5)).toBe(5);
  });
});

describe("scoreCandidates", () => {
  const history = times(8, (i) => attempt(`seen${i}`, true, i % 2 === 0, 4));

  it("ranks the candidate nearest the target level highest", () => {
    // Answering well at level 4 targets level 5, so the hard candidate is the
    // near one. The level the learner was last served is what the controller
    // steps from, which is why the history carries it.
    const scored = scoreCandidates([cand("easy", 1), cand("hard", 5)], history, { startingDifficulty: 4 });
    const easy = scored.find((s) => s.candidate.id === "easy")!;
    const hard = scored.find((s) => s.candidate.id === "hard")!;
    expect(hard.score).toBeGreaterThan(easy.score);
  });


  it("penalises a scenario the learner has just seen", () => {
    const h = [attempt("justSeen", true), ...times(7, (i) => attempt(`s${i}`, true))];
    const scored = scoreCandidates([cand("justSeen", 5), cand("fresh", 5)], h, { startingDifficulty: 5 });
    const seen = scored.find((s) => s.candidate.id === "justSeen")!;
    const fresh = scored.find((s) => s.candidate.id === "fresh")!;
    expect(fresh.score).toBeGreaterThan(seen.score);
  });

  it("penalises a repeat less as it recedes into the past", () => {
    const older = [...times(9, (i) => attempt(`s${i}`, true)), attempt("target", true)];
    const newer = [attempt("target", true), ...times(9, (i) => attempt(`s${i}`, true))];
    const a = scoreCandidates([cand("target", 5)], older, { startingDifficulty: 5 })[0]!.score;
    const b = scoreCandidates([cand("target", 5)], newer, { startingDifficulty: 5 })[0]!.score;
    expect(a).toBeGreaterThan(b);
  });

  it("breaks a run of three identical verdicts", () => {
    const run = times(3, (i) => attempt(`s${i}`, true, true));
    const scored = scoreCandidates([cand("phish", 3, true), cand("legit", 3, false)], run, { startingDifficulty: 3 });
    const phish = scored.find((s) => s.candidate.id === "phish")!;
    const legit = scored.find((s) => s.candidate.id === "legit")!;
    expect(legit.score).toBeGreaterThan(phish.score);
  });

  it("treats both verdicts equally when the recent mix is already even", () => {
    const even = [
      attempt("a", true, true, 3),
      attempt("b", true, false, 3),
      attempt("c", true, true, 3),
      attempt("d", true, false, 3),
    ];
    const scored = scoreCandidates([cand("phish", 3, true), cand("legit", 3, false)], even, { startingDifficulty: 3 });
    expect(scored[0]!.score).toBe(scored[1]!.score);
  });

  it("leans against whichever verdict has been over-served", () => {
    // The pool used to be two-thirds phishing and the old rule only intervened
    // after three identical verdicts in a row, so answering "phishing" every
    // round scored about 62% without any judgement at all.
    const mostlyPhish = times(6, (i) => attempt(`p${i}`, true, true, 3));
    const scored = scoreCandidates([cand("phish", 3, true), cand("legit", 3, false)], mostlyPhish, { startingDifficulty: 3 });
    const phish = scored.find((s) => s.candidate.id === "phish")!;
    const legit = scored.find((s) => s.candidate.id === "legit")!;
    expect(legit.score).toBeGreaterThan(phish.score);
  });

  it("leans the other way just as readily", () => {
    const mostlyLegit = times(6, (i) => attempt(`l${i}`, true, false, 3));
    const scored = scoreCandidates([cand("phish", 3, true), cand("legit", 3, false)], mostlyLegit, { startingDifficulty: 3 });
    const phish = scored.find((s) => s.candidate.id === "phish")!;
    const legit = scored.find((s) => s.candidate.id === "legit")!;
    expect(phish.score).toBeGreaterThan(legit.score);
  });

});

describe("selectScenario", () => {
  it("returns null when there is nothing to choose from", () => {
    expect(selectScenario([], [], { startingDifficulty: 3 })).toBeNull();
  });

  it("returns the only candidate even if it was just seen", () => {
    const h = [attempt("only", true)];
    const chosen = selectScenario([cand("only", 1)], h, { startingDifficulty: 3, rng: first });
    expect(chosen!.id).toBe("only");
  });

  it("serves harder material to a learner who is getting everything right", () => {
    // One step, not a leap to the ceiling. The pool offers every rung so the
    // choice is unambiguous: from 3 they get 4, not 5.
    const right = times(8, (i) => attempt(`s${i}`, true, i % 2 === 0, 3));
    const chosen = selectScenario(
      [cand("1", 1), cand("3", 3), cand("4", 4), cand("5", 5)],
      right,
      { startingDifficulty: 3, rng: first },
    );
    expect(chosen!.difficulty).toBe(4);
  });

  it("serves easier material to a learner who is struggling", () => {
    const wrong = times(8, (i) => attempt(`s${i}`, false, i % 2 === 0, 3));
    const chosen = selectScenario(
      [cand("1", 1), cand("3", 3), cand("5", 5)],
      wrong,
      { startingDifficulty: 5, rng: first },
    );
    expect(chosen!.difficulty).toBe(1);
  });

  it("avoids repeating the previous scenario when an equivalent one exists", () => {
    const h = [attempt("a", true), ...times(7, (i) => attempt(`s${i}`, true))];
    const chosen = selectScenario([cand("a", 5), cand("b", 5)], h, {
      startingDifficulty: 5,
      rng: first,
    });
    expect(chosen!.id).toBe("b");
  });

  it("is deterministic when an rng is supplied", () => {
    const h = times(4, (i) => attempt(`s${i}`, true));
    const pool = [cand("x", 3), cand("y", 3), cand("z", 3)];
    const a = selectScenario(pool, h, { startingDifficulty: 3, rng: () => 0 });
    const b = selectScenario(pool, h, { startingDifficulty: 3, rng: () => 0 });
    expect(a!.id).toBe(b!.id);
  });

  it("spreads across tied candidates rather than always picking the first", () => {
    const h = times(4, (i) => attempt(`s${i}`, true));
    const pool = [cand("x", 3), cand("y", 3), cand("z", 3)];
    const ids = new Set([0, 0.5, 0.99].map((r) => selectScenario(pool, h, {
      startingDifficulty: 3,
      rng: () => r,
    })!.id));
    expect(ids.size).toBe(3);
  });

});

describe("across a session", () => {
  /**
   * The complaint these guards exist for: a learner reporting that practice
   * repeated itself and stayed too easy. Both are session-level properties, so
   * neither is observable from a single call.
   */
  function play(rounds: number, pool: Candidate[], startingDifficulty: number, allCorrect: boolean) {
    let history: HistoryEntry[] = [];
    const served: Candidate[] = [];
    for (let i = 0; i < rounds; i++) {
      const chosen = selectScenario(pool, history, { startingDifficulty, rng: () => 0 })!;
      served.push(chosen);
      history = [attempt(chosen.id, allCorrect, chosen.isPhish, chosen.difficulty), ...history];
    }
    return served;
  }

  it("never serves the same scenario twice in a row when an alternative exists", () => {
    const pool = [cand("a", 3), cand("b", 3), cand("c", 3)];
    const served = play(8, pool, 3, true);
    for (let i = 1; i < served.length; i++) {
      expect(served[i]!.id).not.toBe(served[i - 1]!.id);
    }
  });

  it("climbs to the hardest available level for a learner answering correctly", () => {
    const pool = [cand("e", 1), cand("m", 3), cand("h", 5)];
    const served = play(10, pool, 1, true);
    // Starts where onboarding put them, ends at the ceiling.
    expect(served[0]!.difficulty).toBe(1);
    expect(served[served.length - 1]!.difficulty).toBe(5);
  });

  it("settles at the easiest level for a learner answering incorrectly", () => {
    const pool = [cand("e", 1), cand("m", 3), cand("h", 5)];
    const served = play(10, pool, 5, false);
    expect(served[served.length - 1]!.difficulty).toBe(1);
  });

  it("does not park a learner on one verdict for a whole session", () => {
    const pool = [cand("p1", 3, true), cand("p2", 3, true), cand("l1", 3, false)];
    const served = play(9, pool, 3, true);
    const legit = served.filter((c) => !c.isPhish).length;
    expect(legit).toBeGreaterThan(0);
  });

  it("rotates through a pool rather than favouring one entry", () => {
    const pool = [cand("a", 3), cand("b", 3), cand("c", 3), cand("d", 3)];
    const served = play(12, pool, 3, true);
    expect(new Set(served.map((c) => c.id)).size).toBeGreaterThanOrEqual(3);
  });
});

describe("the shape of a long session", () => {
  /** Plays `rounds` against a learner whose true skill decays with difficulty. */
  function simulate(skill: number, rounds: number, pool: Candidate[]) {
    let history: HistoryEntry[] = [];
    const levels: number[] = [];
    let phish = 0;
    let seed = 1;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < rounds; i++) {
      const chosen = selectScenario(pool, history, { startingDifficulty: 3, rng })!;
      levels.push(chosen.difficulty);
      if (chosen.isPhish) phish++;
      const p = Math.max(0.05, Math.min(0.98, skill - (chosen.difficulty - 3) * 0.18));
      const correct = rng() < p;
      history = [
        { scenarioId: chosen.id, correct, isPhish: chosen.isPhish, difficulty: chosen.difficulty },
        ...history,
      ];
    }
    return {
      accuracy: history.filter((h) => h.correct).length / rounds,
      phishShare: phish / rounds,
      distinctLevels: new Set(levels).size,
      atCap: levels.filter((l) => l === 5).length / rounds,
    };
  }

  const balancedPool: Candidate[] = [1, 2, 3, 4, 5].flatMap((d) =>
    Array.from({ length: 6 }, (_, i) => cand(`d${d}i${i}`, d, i % 2 === 0)),
  );

  it("keeps a strong learner off the ceiling for most of a session", () => {
    // The banded rule pinned anyone above 90% at level 5 and left them there,
    // which is the "always hard, what do I do now" complaint.
    const run = simulate(0.95, 60, balancedPool);
    expect(run.atCap).toBeLessThan(0.8);
    expect(run.distinctLevels).toBeGreaterThan(1);
  });

  it("does not strand a weak learner on a single level either", () => {
    const run = simulate(0.35, 60, balancedPool);
    expect(run.distinctLevels).toBeGreaterThan(1);
  });

  it("holds every skill level inside a band where they are still learning", () => {
    // Neither bored nor beaten: the point of a staircase over a lookup.
    for (const skill of [0.95, 0.8, 0.6, 0.4]) {
      const run = simulate(skill, 60, balancedPool);
      expect(run.accuracy).toBeGreaterThan(0.45);
      expect(run.accuracy).toBeLessThan(0.92);
    }
  });

  it("serves a roughly even mix of verdicts from a balanced pool", () => {
    // Answering one verdict every round used to score about 62%.
    for (const skill of [0.9, 0.6]) {
      const run = simulate(skill, 60, balancedPool);
      expect(run.phishShare).toBeGreaterThan(0.4);
      expect(run.phishShare).toBeLessThan(0.6);
    }
  });

  it("still balances verdicts when the pool itself is lopsided", () => {
    // Two-thirds phishing, which is what the static library used to be.
    const lopsided: Candidate[] = [1, 2, 3, 4, 5].flatMap((d) =>
      Array.from({ length: 6 }, (_, i) => cand(`d${d}i${i}`, d, i % 3 !== 2)),
    );
    const run = simulate(0.7, 60, lopsided);
    expect(run.phishShare).toBeLessThan(0.66);
  });
});

describe("a campaign floor", () => {
  it("lifts the target above what the learner is comfortable with", () => {
    // A campaign that asks for level 4 is a requirement. Without the floor
    // reaching selection, the engine kept serving the learner's own level and
    // the requirement was discharged on material they never met.
    const struggling = times(8, (i) => attempt(`s${i}`, false, i % 2 === 0, 2));
    const chosen = selectScenario(
      [cand("low", 1), cand("mid", 3), cand("high", 4)],
      struggling,
      { startingDifficulty: 2, minDifficulty: 4, rng: first },
    );
    expect(chosen!.difficulty).toBe(4);
  });

  it("does not cap a learner who is already above it", () => {
    const strong = times(8, (i) => attempt(`s${i}`, true, i % 2 === 0, 5));
    const chosen = selectScenario(
      [cand("mid", 3), cand("high", 5)],
      strong,
      { startingDifficulty: 5, minDifficulty: 2, rng: first },
    );
    expect(chosen!.difficulty).toBe(5);
  });

  it("is no constraint at all by default", () => {
    const struggling = times(8, (i) => attempt(`s${i}`, false, i % 2 === 0, 2));
    const withFloor = selectScenario([cand("low", 1), cand("high", 5)], struggling, {
      startingDifficulty: 2,
      minDifficulty: 1,
      rng: first,
    });
    const without = selectScenario([cand("low", 1), cand("high", 5)], struggling, {
      startingDifficulty: 2,
      rng: first,
    });
    expect(withFloor!.difficulty).toBe(without!.difficulty);
  });

  it("clamps an out-of-range floor rather than trusting it", () => {
    const history = times(4, (i) => attempt(`s${i}`, true, i % 2 === 0, 3));
    const chosen = selectScenario([cand("a", 5)], history, {
      startingDifficulty: 3,
      minDifficulty: 99,
      rng: first,
    });
    expect(chosen!.difficulty).toBe(5);
  });
});

describe("a campaign that names red flags", () => {
  it("prefers a scenario that can actually satisfy it", () => {
    // Steering by channel and level alone left a learner practising the right
    // material at the right level on scenarios that could never count, stuck at
    // 0 of 2 indefinitely.
    const history = times(4, (i) => attempt(`s${i}`, true, i % 2 === 0, 3));
    const chosen = selectScenario(
      [cand("without", 3, true, ["urgency_language"]), cand("with", 3, true, ["sender_domain"])],
      history,
      { startingDifficulty: 3, focusCues: ["sender_domain"], rng: first },
    );
    expect(chosen!.id).toBe("with");
  });

  it("still respects the level when both candidates qualify", () => {
    const history = times(4, (i) => attempt(`s${i}`, true, i % 2 === 0, 3));
    const chosen = selectScenario(
      [cand("wrongLevel", 1, true, ["sender_domain"]), cand("rightLevel", 4, true, ["sender_domain"])],
      history,
      { startingDifficulty: 3, focusCues: ["sender_domain"], rng: first },
    );
    expect(chosen!.difficulty).toBe(4);
  });

  it("would rather serve the wrong level than something that cannot count", () => {
    // A round on a scenario that cannot count is wasted, not merely mistargeted.
    const history = times(4, (i) => attempt(`s${i}`, true, i % 2 === 0, 3));
    const chosen = selectScenario(
      [cand("rightLevelNoCue", 4, true, []), cand("offLevelWithCue", 2, true, ["sender_domain"])],
      history,
      { startingDifficulty: 3, focusCues: ["sender_domain"], rng: first },
    );
    expect(chosen!.id).toBe("offLevelWithCue");
  });

  it("ignores cues entirely when the campaign names none", () => {
    const history = times(4, (i) => attempt(`s${i}`, true, i % 2 === 0, 3));
    const chosen = selectScenario(
      [cand("a", 4, true, []), cand("b", 1, true, ["sender_domain"])],
      history,
      { startingDifficulty: 3, rng: first },
    );
    expect(chosen!.id).toBe("a");
  });
});

describe("red flags the learner owes a review on", () => {
  const history = () => times(4, (i) => attempt(`s${i}`, true, i % 2 === 0, 3));

  it("prefers a scenario that rehearses one of them", () => {
    const chosen = selectScenario(
      [cand("unrelated", 3, true, ["generic_greeting"]), cand("owed", 3, true, ["sender_domain"])],
      history(),
      { startingDifficulty: 3, reviewCues: ["sender_domain"], rng: first },
    );
    expect(chosen!.id).toBe("owed");
  });

  it("never outweighs a campaign requirement", () => {
    // A campaign is an obligation and review is a need. If review could win,
    // mandatory training would quietly stop progressing -- the exact bug the
    // separate weights exist to prevent.
    const chosen = selectScenario(
      [
        cand("required", 3, true, ["credential_request"]),
        cand("owed", 3, true, ["sender_domain"]),
      ],
      history(),
      {
        startingDifficulty: 3,
        focusCues: ["credential_request"],
        reviewCues: ["sender_domain"],
        rng: first,
      },
    );
    expect(chosen!.id).toBe("required");
  });

  it("breaks the tie among candidates that all satisfy the campaign", () => {
    const chosen = selectScenario(
      [
        cand("campaignOnly", 3, true, ["credential_request"]),
        cand("campaignAndReview", 3, true, ["credential_request", "sender_domain"]),
      ],
      history(),
      {
        startingDifficulty: 3,
        focusCues: ["credential_request"],
        reviewCues: ["sender_domain"],
        rng: first,
      },
    );
    expect(chosen!.id).toBe("campaignAndReview");
  });

  it("does not override the level by more than the level term allows", () => {
    // Review is a nudge, not a mandate: it should not drag a learner two levels
    // off target to rehearse something.
    const chosen = selectScenario(
      [cand("onLevel", 4, true, []), cand("farOffLevel", 1, true, ["sender_domain"])],
      history(),
      { startingDifficulty: 3, reviewCues: ["sender_domain"], rng: first },
    );
    expect(chosen!.id).toBe("onLevel");
  });

  it("changes nothing when the learner owes no reviews", () => {
    const chosen = selectScenario(
      [cand("a", 4, true, []), cand("b", 1, true, ["sender_domain"])],
      history(),
      { startingDifficulty: 3, reviewCues: [], rng: first },
    );
    expect(chosen!.difficulty).toBe(4);
  });
});
