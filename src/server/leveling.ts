export type Level = "beginner" | "intermediate" | "advanced";

const THRESHOLDS: { level: Level; min: number; max: number | null }[] = [
  { level: "beginner", min: 0, max: 150 },
  { level: "intermediate", min: 150, max: 400 },
  { level: "advanced", min: 400, max: null },
];

export function levelForXp(xp: number): Level {
  for (const t of THRESHOLDS) {
    if (xp >= t.min && (t.max === null || xp < t.max)) {
      return t.level;
    }
  }
  return "advanced";
}

/** Assign the initial level from the normalized 0-1 ML awareness score. */
export function levelForAwarenessScore(score: number): Level {
  if (!Number.isFinite(score) || score < 0.4) return "beginner";
  if (score < 0.65) return "intermediate";
  return "advanced";
}

/** Start at the level floor so later XP awards preserve normal progression. */
export function minimumXpForLevel(level: Level): number {
  return THRESHOLDS.find((threshold) => threshold.level === level)?.min ?? 0;
}

export function xpProgress(xp: number): { xpIntoLevel: number; xpToNextLevel: number } {
  const current = THRESHOLDS.find((t) => xp >= t.min && (t.max === null || xp < t.max)) ?? THRESHOLDS[2]!;
  if (current.max === null) {
    return { xpIntoLevel: xp - current.min, xpToNextLevel: 0 };
  }
  return { xpIntoLevel: xp - current.min, xpToNextLevel: current.max - xp };
}
