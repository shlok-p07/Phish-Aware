import { describe, it, expect } from "bun:test";
import {
  levelForAwarenessScore,
  levelForXp,
  minimumXpForLevel,
  xpProgress,
} from "./leveling";

describe("levelForXp", () => {
  it("returns beginner from 0 up to (not including) 150", () => {
    expect(levelForXp(0)).toBe("beginner");
    expect(levelForXp(149)).toBe("beginner");
  });

  it("returns intermediate from 150 up to (not including) 400", () => {
    expect(levelForXp(150)).toBe("intermediate");
    expect(levelForXp(399)).toBe("intermediate");
  });

  it("returns advanced at 400 and beyond", () => {
    expect(levelForXp(400)).toBe("advanced");
    expect(levelForXp(10_000)).toBe("advanced");
  });

  // Every real write path floors xpAwarded at 0, so this shouldn't be
  // reachable through normal use -- but the loop matches none of the
  // thresholds for negative/NaN input, and the old fallback defaulted to
  // "advanced", the opposite of a safe default for bad input.
  it("fails closed to beginner for negative or non-finite XP", () => {
    expect(levelForXp(-10)).toBe("beginner");
    expect(levelForXp(Number.NaN)).toBe("beginner");
  });
});

describe("xpProgress", () => {
  it("reports progress within the beginner band", () => {
    expect(xpProgress(0)).toEqual({ xpIntoLevel: 0, xpToNextLevel: 150 });
    expect(xpProgress(100)).toEqual({ xpIntoLevel: 100, xpToNextLevel: 50 });
  });

  it("reports progress within the intermediate band", () => {
    expect(xpProgress(200)).toEqual({ xpIntoLevel: 50, xpToNextLevel: 200 });
  });

  it("caps out at the advanced band with no next level", () => {
    expect(xpProgress(500)).toEqual({ xpIntoLevel: 100, xpToNextLevel: 0 });
  });

  it("fails closed to the beginner band for negative or non-finite XP", () => {
    expect(xpProgress(-10)).toEqual({ xpIntoLevel: 0, xpToNextLevel: 150 });
    expect(xpProgress(Number.NaN)).toEqual({ xpIntoLevel: 0, xpToNextLevel: 150 });
  });
});

describe("levelForAwarenessScore", () => {
  it("maps awareness bands to the initial user level", () => {
    expect(levelForAwarenessScore(0)).toBe("beginner");
    expect(levelForAwarenessScore(0.39)).toBe("beginner");
    expect(levelForAwarenessScore(0.4)).toBe("intermediate");
    expect(levelForAwarenessScore(0.64)).toBe("intermediate");
    expect(levelForAwarenessScore(0.65)).toBe("advanced");
    expect(levelForAwarenessScore(1)).toBe("advanced");
  });

  it("fails closed to beginner for a non-finite score", () => {
    expect(levelForAwarenessScore(Number.NaN)).toBe("beginner");
  });
});

describe("minimumXpForLevel", () => {
  it("returns the XP floor that prevents a starting-level demotion", () => {
    expect(minimumXpForLevel("beginner")).toBe(0);
    expect(minimumXpForLevel("intermediate")).toBe(150);
    expect(minimumXpForLevel("advanced")).toBe(400);
  });
});
