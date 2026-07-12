import { Router, type IRouter } from "express";
import { db, scenariosTable, attemptsTable, usersTable } from "@workspace/db";
import { and, eq, notInArray } from "drizzle-orm";
import { ListCueOptionsResponse, GetNextPracticeScenarioResponse, SubmitAttemptBody, SubmitAttemptResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { CUE_OPTIONS, type CueId } from "../lib/cues";
import { gradeAttempt } from "../lib/grading";
import { levelForXp } from "../lib/leveling";
import { computeStreak } from "../lib/streak";

const router: IRouter = Router();

router.get("/practice/cue-options", (_req, res) => {
  res.json(ListCueOptionsResponse.parse(CUE_OPTIONS));
});

router.get("/practice/next", requireAuth, async (req, res) => {
  const pool = await db
    .select()
    .from(scenariosTable)
    .where(and(eq(scenariosTable.vector, "email"), eq(scenariosTable.isOnboarding, false)));

  if (pool.length === 0) {
    res.status(404).json({ error: "No practice scenarios available" });
    return;
  }

  const attempted = await db.select().from(attemptsTable).where(eq(attemptsTable.userId, req.userId!));
  const attemptedIds = new Set(attempted.map((a) => a.scenarioId));

  // Prefer scenarios the user hasn't seen yet; if all seen, weight toward their weak cues.
  let candidates = pool.filter((s) => !attemptedIds.has(s.id));
  if (candidates.length === 0) {
    candidates = pool;
  }

  const weakCueCounts = new Map<string, number>();
  for (const a of attempted) {
    for (const cue of a.missedCues) {
      weakCueCounts.set(cue, (weakCueCounts.get(cue) ?? 0) + 1);
    }
  }

  const weighted = candidates.flatMap((s) => {
    const overlap = s.cues.reduce((acc, c) => acc + (weakCueCounts.get(c.label) ?? 0), 0);
    const weight = 1 + overlap;
    return Array(weight).fill(s);
  });

  const chosen = weighted[Math.floor(Math.random() * weighted.length)]!;

  res.json(
    GetNextPracticeScenarioResponse.parse({
      id: chosen.id,
      vector: chosen.vector,
      sender: chosen.sender,
      subject: chosen.subject,
      body: chosen.body,
      links: chosen.links,
      attachmentName: chosen.attachmentName,
      difficulty: chosen.difficulty,
    }),
  );
});

router.post("/practice/attempts", requireAuth, async (req, res) => {
  const body = SubmitAttemptBody.parse(req.body);
  const [scenario] = await db.select().from(scenariosTable).where(eq(scenariosTable.id, body.scenarioId)).limit(1);
  if (!scenario) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const graded = gradeAttempt(scenario, body.verdict, body.selectedCues as CueId[], body.confidence);

  await db.insert(attemptsTable).values({
    userId: user.id,
    scenarioId: scenario.id,
    userVerdict: body.verdict,
    selectedCues: body.selectedCues,
    confidence: body.confidence,
    correct: graded.correct,
    missedCues: graded.missedCues,
    falseCues: graded.falseCues,
    caughtCues: graded.caughtCues,
    explanation: graded.explanation,
    calibrationNote: graded.calibrationNote,
    xpAwarded: graded.xpAwarded,
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const newStreak = computeStreak(user.lastActiveDate, todayIso, user.streak);
  const newXp = user.xp + graded.xpAwarded;
  const oldLevel = levelForXp(user.xp);
  const newLevel = levelForXp(newXp);
  const leveledUp = newLevel !== oldLevel;

  const badgesEarned: string[] = [];
  const existingBadges = new Set(user.badges);
  const priorAttempts = await db.select().from(attemptsTable).where(eq(attemptsTable.userId, user.id));
  const priorCorrectCount = priorAttempts.filter((a) => a.correct).length;
  if (graded.correct && priorCorrectCount === 0 && !existingBadges.has("first_catch")) {
    badgesEarned.push("first_catch");
  }
  if (newStreak >= 7 && !existingBadges.has("week_streak")) {
    badgesEarned.push("week_streak");
  }
  if (graded.caughtCues.includes("mismatched_domain") && !existingBadges.has("domain_detective")) {
    badgesEarned.push("domain_detective");
  }
  const updatedBadges = [...user.badges, ...badgesEarned.filter((b) => !existingBadges.has(b))];

  await db
    .update(usersTable)
    .set({
      xp: newXp,
      level: newLevel,
      streak: newStreak,
      lastActiveDate: todayIso,
      badges: updatedBadges,
    })
    .where(eq(usersTable.id, user.id));

  res.json(
    SubmitAttemptResponse.parse({
      correct: graded.correct,
      correctVerdict: graded.correctVerdict,
      caughtCues: graded.caughtCues,
      missedCues: graded.missedCues,
      falseCues: graded.falseCues,
      explanation: graded.explanation,
      calibrationNote: graded.calibrationNote,
      xpAwarded: graded.xpAwarded,
      totalXp: newXp,
      level: newLevel,
      leveledUp,
      streak: newStreak,
      badgesEarned,
    }),
  );
  void notInArray;
});

export default router;
