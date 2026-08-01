import { NextRequest } from "next/server";
import { scenariosCollection, usersCollection } from "@/db";
import { SubmitOnboardingQuizBody, SubmitOnboardingQuizResponse } from "@/api-zod";
import { levelForAwarenessScore, minimumXpForLevel } from "@/server/leveling";
import { predictAwareness } from "@/server/mlClient";
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

  // The ML score selects both the initial level and generated-scenario
  // difficulty. Diagnostic accuracy remains the resilient fallback.
  let phishingAwarenessScore = accuracy;
  let phishingAwarenessModelVersion = "diagnostic-accuracy-v0";
  let phishingAwarenessComputedAt = new Date();

  // The intro survey arrives as a feature vector (see src/lib/onboarding-survey.ts).
  // department/workType are denormalized out of it because the scenario
  // generator reads them on every practice request.
  const features = body.features ?? null;

  // Model inference is an enhancement, never a gate on onboarding. A missing
  // artifact, deployment outage, timeout, or invalid response falls back to
  // the deterministic diagnostic accuracy users received before ML existed.
  if (features) {
    try {
      const prediction = await predictAwareness(features, accuracy);
      phishingAwarenessScore = prediction.awareness_score;
      phishingAwarenessModelVersion = prediction.model_version;
      phishingAwarenessComputedAt = new Date();
    } catch (cause) {
      console.warn("Awareness prediction unavailable; using diagnostic accuracy", cause);
    }
  }

  const level = levelForAwarenessScore(phishingAwarenessScore);
  // Existing gameplay promotes users from XP thresholds. Initializing XP at
  // the assigned level's floor prevents the first attempt from demoting them.
  const startingXp = minimumXpForLevel(level);

  const users = await usersCollection();
  await users.updateOne(
    { _id: userId },
    {
      $set: {
        xp: startingXp,
        level,
        onboardingCompleted: true,
        phishingAwarenessScore,
        phishingAwarenessModelVersion,
        phishingAwarenessComputedAt,
        // Absent only if a client submits the diagnostic without the survey.
        // Leave the stored values alone rather than clearing a department the
        // org pinned to the invitation.
        ...(features
          ? {
              surveyFeatures: features,
              department: features.department,
              workType: features.work_mode,
            }
          : {}),
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
