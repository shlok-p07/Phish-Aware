import { ObjectId } from "mongodb";
import { toObjectId } from "@/db/objectId";
import { NextRequest } from "next/server";
import { scenariosCollection, usersCollection, surveyResponsesCollection, specDefaults } from "@/db";
import {
  SubmitOnboardingQuizBody,
  SubmitOnboardingQuizResponse,
} from "@/api-zod";
import { levelForAwarenessScore, minimumXpForLevel } from "@/server/leveling";
import { predictAwareness } from "@/server/mlClient";
import {
  ONBOARDING_SURVEY_KEY,
  ONBOARDING_SURVEY_VERSION,
} from "@/lib/onboarding-survey";
import { json, requireUserId, withErrorHandling, readJsonBody } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = SubmitOnboardingQuizBody.parse(await readJsonBody(req));
  // Only the scenarios this submission actually answers. Reading the whole
  // collection to resolve a dozen ids grew with the generated pool on every
  // onboarding submit.
  const answered = [...new Set(body.answers.map((a) => a.scenarioId))]
    .map(toObjectId)
    .filter((id): id is ObjectId => id !== null);
  const scenarios = answered.length
    ? await (await scenariosCollection()).find({ _id: { $in: answered } }).toArray()
    : [];
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
      console.warn(
        "Awareness prediction unavailable; using diagnostic accuracy",
        cause,
      );
    }
  }

  const level = levelForAwarenessScore(phishingAwarenessScore);
  // Existing gameplay promotes users from XP thresholds. Initializing XP at
  // the assigned level's floor prevents the first attempt from demoting them.
  const startingXp = minimumXpForLevel(level);

  const users = await usersCollection();

  // An org that invites someone into a department has made an administrative
  // assignment, and the employee is not the one who gets to revise it. The
  // survey hides the department question when the org pinned one, but that is a
  // client-side courtesy: the request body still carries whatever the caller put
  // there. Department decides which attack types a trainee is drilled on and
  // which colleagues they are ranked against, so honouring a self-reported
  // override would let an employee opt out of their own department's reporting
  // and read another department's leaderboard. Self-signup users, who have no
  // org to assign them, keep answering for themselves.
  const assigned = await users.findOne(
    { _id: userId },
    { projection: { orgId: 1, department: 1 } },
  );
  const orgAssignedDepartment =
    assigned?.orgId != null && assigned.department != null
      ? assigned.department
      : null;

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
              department: orgAssignedDepartment ?? features.department,
              workType: features.work_mode,
            }
          : {}),
      },
    },
  );

  // Keep the submission itself, not just the vector it reduced to. Without this
  // the answers behind somebody's starting level were gone the moment the user
  // document was next written, so a score could never be explained or audited.
  // Append-only and best-effort: onboarding must not fail over a history write.
  if (features) {
    try {
      const responses = await surveyResponsesCollection();
      const id = new ObjectId();
      await responses.insertOne({
        _id: id,
        surveyResponseId: id,
        surveyKey: ONBOARDING_SURVEY_KEY,
        surveyVersion: ONBOARDING_SURVEY_VERSION,
        purpose: "onboarding_baseline",
        userId,
        orgId: assigned?.orgId ?? null,
        answers: Object.entries(features).map(([questionKey, value]) => ({ questionKey, value })),
        derivedSignals: { ...features },
        // Stored 0-100 to match the validator's range; the score is a fraction.
        baselineRiskContribution: Math.round(phishingAwarenessScore * 100),
        completedAt: phishingAwarenessComputedAt,
        ...specDefaults(),
      });
    } catch (cause) {
      console.error("[onboarding] failed to record survey response", cause);
    }
  }

  return json(
    SubmitOnboardingQuizResponse.parse({
      level,
      correctCount,
      totalCount,
    }),
  );
});
