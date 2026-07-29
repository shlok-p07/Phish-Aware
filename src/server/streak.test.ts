import { describe, it, expect } from "bun:test";
import { computeStreak } from "./streak";

describe("computeStreak", () => {
  it("keeps the streak when already active today", () => {
    expect(computeStreak("2024-01-15", "2024-01-15", 5)).toBe(5);
  });

  it("treats a same-day first activity as a streak of 1", () => {
    expect(computeStreak("2024-01-15", "2024-01-15", 0)).toBe(1);
  });

  it("increments the streak when the last activity was yesterday", () => {
    expect(computeStreak("2024-01-14", "2024-01-15", 5)).toBe(6);
  });

  it("handles month boundaries (incl. leap day) via UTC math", () => {
    expect(computeStreak("2024-02-29", "2024-03-01", 3)).toBe(4);
  });

  it("resets to 1 after a gap", () => {
    expect(computeStreak("2024-01-10", "2024-01-15", 9)).toBe(1);
  });

  it("resets to 1 when there is no prior activity", () => {
    expect(computeStreak(null, "2024-01-15", 4)).toBe(1);
  });
});
