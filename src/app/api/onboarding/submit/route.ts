import { NextRequest } from "next/server";
import { scenariosCollection, usersCollection } from "@/db";
import { SubmitOnboardingQuizBody, SubmitOnboardingQuizResponse } from "@/api-zod";
import { levelForXp } from "@/server/leveling";
import { json, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = SubmitOnboardingQuizBody.parse(await req.json());
  const scenarios = await (await scenariosCollection()).find().toArray();
  const scenarioMap = new Map(scenarios.map((s) => [s._id.toString(), s]));

  let correctCount = 0;
  for (const answer of body.answers) {
    const scenario = scenarioMap.get(answer.scenarioId);
    if (scenario && scenario.isPhish === answer.verdict) {
      correctCount++;
    }
  }
  const totalCount = body.answers.length;
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

  // Starting level based on diagnostic accuracy, with a small XP head start.
  const startingXp = Math.round(accuracy * 120);
  const level = levelForXp(startingXp);
  // Phase 1 of the adaptive scenario generator: awareness score starts as
  // diagnostic accuracy. It's what maps to generated-scenario difficulty
  // (see src/server/attackProfiles.ts) -- distinct from calibrationScore,
  // which measures confidence-vs-correctness, not raw detection accuracy.
  const phishingAwarenessScore = accuracy;

  const users = await usersCollection();
  await users.updateOne(
    { _id: userId },
    {
      $set: {
        xp: startingXp,
        level,
        onboardingCompleted: true,
        phishingAwarenessScore,
        department: body.department ?? null,
        workType: body.workType ?? null,
        ageRange: body.ageRange ?? null,
      },
    },
  );

  return json(
    SubmitOnboardingQuizResponse.parse({
      level,
      correctCount,
      totalCount,
    }),
  );
});
