import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { scenariosCollection, attemptsCollection, usersCollection, toObjectId } from "@/db";
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

  const scenarioId = toObjectId(body.scenarioId);
  if (!scenarioId) {
    return error(400, "Invalid scenario id");
  }

  const scenarios = await scenariosCollection();
  const scenario = await scenarios.findOne({ _id: scenarioId });
  if (!scenario) {
    return error(404, "Scenario not found");
  }
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user) {
    return error(401, "Not authenticated");
  }

  const graded = gradeAttempt(scenario, body.verdict, body.selectedCues as CueId[], body.confidence);

  const attempts = await attemptsCollection();
  await attempts.insertOne({
    _id: new ObjectId(),
    userId: user._id,
    orgId: user.orgId ?? null,
    scenarioId: scenario._id,
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
    createdAt: new Date(),
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const newStreak = computeStreak(user.lastActiveDate, todayIso, user.streak);
  const newXp = user.xp + graded.xpAwarded;
  const oldLevel = levelForXp(user.xp);
  const newLevel = levelForXp(newXp);
  const leveledUp = newLevel !== oldLevel;

  const badgesEarned: string[] = [];
  const existingBadges = new Set(user.badges);
  const priorAttempts = await attempts.find({ userId: user._id }).toArray();
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

  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        xp: newXp,
        level: newLevel,
        streak: newStreak,
        lastActiveDate: todayIso,
        badges: updatedBadges,
      },
    },
  );

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
