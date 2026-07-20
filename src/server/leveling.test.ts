import { describe, it, expect } from "bun:test";
import { levelForXp, xpProgress } from "./leveling";

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
});
