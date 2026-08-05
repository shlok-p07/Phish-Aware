import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { scenariosCollection, attemptsCollection, usersCollection, specDefaults } from "@/db";
import type { ScenarioDoc } from "@/db";
import { GetNextPracticeScenarioResponse } from "@/api-zod";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";
import {
  pickAttackProfile,
  pickVector,
  pickIsPhish,
  difficultyForAwarenessScore,
  type VectorPreference,
} from "@/server/attackProfiles";
import { generatePhishingScenario } from "@/server/scenarioGenerator";
import { topUpPoolInBackground } from "@/server/scenarioPool";
import { personalizeScenario } from "@/server/personalize";

export const dynamic = "force-dynamic";

function parseVectorPreference(raw: string | null): VectorPreference | undefined {
  return raw === "email" || raw === "sms" || raw === "voice" || raw === "mixed" ? raw : undefined;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const vectorPreference = parseVectorPreference(req.nextUrl.searchParams.get("vector"));

  const scenarios = await scenariosCollection();
  const attempted = await (await attemptsCollection()).find({ userId }).toArray();
  const attemptedIds = new Set(attempted.map((a) => a.scenarioId.toString()));

  const user = await (await usersCollection()).findOne({ _id: userId });
  const { persuasionTactic, attackType } = pickAttackProfile(user?.department ?? null);
  const vector = pickVector(vectorPreference);
  const isPhish = pickIsPhish();
  const genParams = {
    vector,
    isPhish,
    department: user?.department ?? null,
    workType: user?.workType ?? null,
    difficulty: difficultyForAwarenessScore(user?.phishingAwarenessScore ?? 0),
    persuasionTactic,
    attackType,
  };

  // Serve instantly from whatever's already sitting in the pool (the static
  // library plus previously live-generated scenarios) instead of blocking
  // every single round on a live ~5-20s two-stage LLM call. A round only
  // waits on live generation if this vector's pool is completely dry for
  // this user (a brand-new vector, or someone who's worked through
  // everything generated so far) -- otherwise generation happens in the
  // background (see topUpPoolInBackground) so the pool stays replenished
  // with fresh, personalized content for next time without anyone waiting
  // on it.
  const pool = await scenarios.find({ vector, isOnboarding: false }).toArray();
  let candidates: ScenarioDoc[] = pool.filter((s) => !attemptedIds.has(s._id.toString()));

  // Someone who has worked through everything used to wait on a live two-stage
  // LLM call before seeing anything -- up to ~40s, and longer once the client
  // retries. If either provider is rate limited or unconfigured they waited
  // that long only to be told there was nothing. Resurfacing a scenario they
  // have already seen is instant and strictly better than a spinner, and the
  // background top-up still brings in fresh material for next round.
  const exhausted = candidates.length === 0 && pool.length > 0;
  if (exhausted) {
    candidates = pool;
  }

  if (candidates.length > 0) {
    const availableGenerated = candidates.filter((s) => s.source === "ai_generated").length;
    topUpPoolInBackground(genParams, user?.orgId ?? null, availableGenerated);
  } else {
    // Only now is blocking justified: this vector has nothing stored at all,
    // so generation is the only way to answer the request.
    const generated = await generatePhishingScenario(genParams);
    if (generated) {
      const id = new ObjectId();
      const inserted: ScenarioDoc = {
        _id: id,
        scenarioId: id,
        orgId: user?.orgId ?? null,
        ...generated,
        source: "ai_generated",
        ...specDefaults(),
      };
      await scenarios.insertOne(inserted);
      candidates = [inserted];
    }
  }

  if (candidates.length === 0) {
    return error(404, "No practice scenarios available");
  }

  const weakCueCounts = new Map<string, number>();
  for (const a of attempted) {
    for (const cue of a.missedCues) {
      weakCueCounts.set(cue, (weakCueCounts.get(cue) ?? 0) + 1);
    }
  }

  const weighted = candidates.flatMap((s) => {
    const overlap = s.cues.reduce((acc, c) => acc + (weakCueCounts.get(c.type) ?? 0), 0);
    const weight = 1 + overlap;
    return Array(weight).fill(s);
  });

  const chosen = weighted[Math.floor(Math.random() * weighted.length)]!;

  // The stored scenario is shared across everyone practicing, so it addresses
  // the reader by a placeholder token. Resolve it to *this* user's name on the
  // way out -- that's what makes the same pooled scenario read as personal.
  const personalized = personalizeScenario(chosen, user?.name);

  return json(
    GetNextPracticeScenarioResponse.parse({
      id: chosen._id.toString(),
      vector: personalized.vector,
      sender: personalized.sender,
      subject: personalized.subject,
      body: personalized.body,
      links: personalized.links,
      attachments: personalized.attachments,
      difficulty: personalized.difficulty,
    }),
  );
});
