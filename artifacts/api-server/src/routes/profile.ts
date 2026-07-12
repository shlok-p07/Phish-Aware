import { Router, type IRouter } from "express";
import { db, attemptsTable, scenariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetAnalyticsResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { CUE_LABELS, type CueId } from "../lib/cues";

const router: IRouter = Router();

router.get("/profile/analytics", requireAuth, async (req, res) => {
  const attempts = await db.select().from(attemptsTable).where(eq(attemptsTable.userId, req.userId!));
  const scenarios = await db.select().from(scenariosTable);
  const scenarioMap = new Map(scenarios.map((s) => [s.id, s]));

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
  const cueAccuracy = Array.from(cueStats.entries()).map(([cueId, s]) => ({
    cueId: cueId as CueId,
    label: CUE_LABELS[cueId as CueId],
    attempts: s.caught + s.missed,
    rate: s.caught / (s.caught + s.missed),
  }));

  const vectorStats = new Map<string, { correct: number; total: number }>();
  for (const a of attempts) {
    const scenario = scenarioMap.get(a.scenarioId);
    if (!scenario) continue;
    const s = vectorStats.get(scenario.vector) ?? { correct: 0, total: 0 };
    s.total++;
    if (a.correct) s.correct++;
    vectorStats.set(scenario.vector, s);
  }
  const vectorAccuracy = Array.from(vectorStats.entries()).map(([vector, s]) => ({
    vector: vector as "email" | "sms" | "voice" | "qr" | "social" | "website",
    attempts: s.total,
    rate: s.correct / s.total,
  }));

  const calibrationScores = attempts.map((a) => {
    const confidenceFrac = a.confidence / 100;
    return a.correct ? confidenceFrac : 1 - confidenceFrac;
  });
  const calibrationScore =
    calibrationScores.length > 0 ? calibrationScores.reduce((a, b) => a + b, 0) / calibrationScores.length : 0;

  const dayStats = new Map<string, { correct: number; total: number }>();
  for (const a of attempts) {
    const day = a.createdAt.toISOString().slice(0, 10);
    const s = dayStats.get(day) ?? { correct: 0, total: 0 };
    s.total++;
    if (a.correct) s.correct++;
    dayStats.set(day, s);
  }
  const progressOverTime = Array.from(dayStats.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, s]) => ({ date: new Date(date), accuracyRate: s.correct / s.total, attempts: s.total }));

  res.json(
    GetAnalyticsResponse.parse({
      cueAccuracy,
      vectorAccuracy,
      calibrationScore,
      progressOverTime,
      totalAttempts: attempts.length,
    }),
  );
});

export default router;
