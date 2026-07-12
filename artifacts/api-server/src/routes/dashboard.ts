import { Router, type IRouter } from "express";
import { db, usersTable, attemptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { xpProgress } from "../lib/leveling";
import { CUE_LABELS, type CueId } from "../lib/cues";

const router: IRouter = Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const attempts = await db.select().from(attemptsTable).where(eq(attemptsTable.userId, user.id));

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
    .map(([cueId, s]) => ({ cueId: cueId as CueId, rate: s.caught / (s.caught + s.missed), total: s.caught + s.missed }))
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
  const accuracyRate = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

  res.json(
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

export default router;
