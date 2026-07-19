import { NextRequest } from "next/server";
import { db, scenariosTable, attemptsTable, usersTable } from "@/db";
import { eq } from "drizzle-orm";
import { SubmitAttemptBody, SubmitAttemptResponse } from "@/api-zod";
import { type CueId } from "@/server/cues";
import { gradeAttempt } from "@/server/grading";
import { levelForXp } from "@/server/leveling";
import { computeStreak } from "@/server/streak";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = SubmitAttemptBody.parse(await req.json());

  const [scenario] = await db
    .select()
    .from(scenariosTable)
    .where(eq(scenariosTable.id, body.scenarioId))
    .limit(1);
  if (!scenario) {
    return error(404, "Scenario not found");
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    return error(401, "Not authenticated");
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

  return json(
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
});
