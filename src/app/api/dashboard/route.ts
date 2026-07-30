import { usersCollection, attemptsCollection } from "@/db";
import { GetDashboardResponse } from "@/api-zod";
import { xpProgress } from "@/server/leveling";
import { CUE_LABELS, type CueId } from "@/server/cues";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";
import { percent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user) {
    return error(401, "Not authenticated");
  }
  const attempts = await (await attemptsCollection()).find({ userId: user._id }).toArray();

  const cueStats = new Map<string, { caught: number; missed: number }>();
  for (const a of attempts) {
    for (const c of a.caughtCues) {
      const s = cueStats.get(c) ?? { caught: 0, missed: 0 };
      s.caught++;
      cueStats.set(c, s);
    }
    for (const c of a.missedCues) {
      const s = cueStats.get(c) ?? { caught: 0, missed: 0 };
      s.missed++;
      cueStats.set(c, s);
    }
  }

  const rated = Array.from(cueStats.entries())
    .map(([cueId, s]) => ({
      cueId: cueId as CueId,
      rate: s.caught / (s.caught + s.missed),
      total: s.caught + s.missed,
    }))
    .filter((r) => r.total >= 1);

  const strongCues = rated
    .filter((r) => r.rate >= 0.6)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3)
    .map((r) => ({ id: r.cueId, label: CUE_LABELS[r.cueId] }));

  const weakCues = rated
    .filter((r) => r.rate < 0.6)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3)
    .map((r) => ({ id: r.cueId, label: CUE_LABELS[r.cueId] }));

  const { xpIntoLevel, xpToNextLevel } = xpProgress(user.xp);
  const totalAttempts = attempts.length;
  const correctAttempts = attempts.filter((a) => a.correct).length;
  const accuracyRate = totalAttempts > 0 ? percent(correctAttempts / totalAttempts) : 0;

  return json(
    GetDashboardResponse.parse({
      name: user.name,
      level: user.level,
      xp: user.xp,
      xpToNextLevel,
      xpIntoLevel,
      streak: user.streak,
      strongCues,
      weakCues,
      badges: user.badges,
      totalAttempts,
      accuracyRate,
    }),
  );
});
