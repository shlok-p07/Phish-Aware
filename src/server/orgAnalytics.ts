import { ObjectId } from "mongodb";
import { attemptsCollection } from "@/db";

export type RiskLevel = "low" | "medium" | "high";

export function riskLevelForAccuracy(accuracy: number, totalAttempts: number): RiskLevel {
  if (totalAttempts === 0) return "high"; // no data yet -- treat as unproven/high-risk
  if (accuracy >= 80) return "low";
  if (accuracy >= 50) return "medium";
  return "high";
}

/** Per-member accuracy (0-100) and attempt count, computed from real attempts. */
export async function computeMemberStats(
  userIds: ObjectId[],
): Promise<Map<string, { accuracy: number; totalAttempts: number }>> {
  const attempts = await attemptsCollection();
  const stats = new Map<string, { correct: number; total: number }>();
  for (const id of userIds) {
    stats.set(id.toString(), { correct: 0, total: 0 });
  }
  const docs = await attempts.find({ userId: { $in: userIds } }).toArray();
  for (const a of docs) {
    const key = a.userId.toString();
    const s = stats.get(key);
    if (!s) continue;
    s.total++;
    if (a.correct) s.correct++;
  }
  const result = new Map<string, { accuracy: number; totalAttempts: number }>();
  for (const [key, s] of stats) {
    result.set(key, {
      accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
      totalAttempts: s.total,
    });
  }
  return result;
}
