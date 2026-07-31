import { ObjectId } from "mongodb";
import { scenariosCollection, attemptsCollection, usersCollection, specDefaults } from "@/db";
import type { ScenarioDoc } from "@/db";
import { GetNextPracticeScenarioResponse } from "@/api-zod";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";
import { pickAttackProfile, difficultyForAwarenessScore } from "@/server/attackProfiles";
import { generatePhishingScenario } from "@/server/scenarioGenerator";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();

  const scenarios = await scenariosCollection();
  const attempted = await (await attemptsCollection()).find({ userId }).toArray();
  const attemptedIds = new Set(attempted.map((a) => a.scenarioId.toString()));

  // Generate a fresh scenario on (almost) every round rather than once and
  // reusing it -- an unattempted generated scenario would otherwise just sit
  // in the pool and keep getting served back on every refresh/next call
  // until someone actually completes it, which looked like the generator was
  // stuck repeating the same department/attack-type combo. Phase 1 (see
  // project's AI-pipeline spec): department/work type feed the prompt,
  // tactic/attack type are picked at random each time; Phase 2 will weight
  // those picks by this user's per-tactic accuracy once enough history exists.
  const user = await (await usersCollection()).findOne({ _id: userId });
  const { persuasionTactic, attackType } = pickAttackProfile(user?.department ?? null);
  const generated = await generatePhishingScenario({
    department: user?.department ?? null,
    workType: user?.workType ?? null,
    difficulty: difficultyForAwarenessScore(user?.phishingAwarenessScore ?? 0),
    persuasionTactic,
    attackType,
  });

  let candidates: ScenarioDoc[];

  if (generated) {
    const id = new ObjectId();
    const inserted = {
      _id: id,
      scenarioId: id,
      orgId: user?.orgId ?? null,
      ...generated,
      ...specDefaults(),
    };
    await scenarios.insertOne(inserted);
    candidates = [inserted];
  } else {
    // Groq unavailable/failed: fall back to the static seed pool, same
    // weak-cue-weighted selection as before.
    const pool = await scenarios.find({ vector: "email", isOnboarding: false }).toArray();
    candidates = pool.filter((s) => !attemptedIds.has(s._id.toString()));
    if (candidates.length === 0) {
      candidates = pool;
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

  return json(
    GetNextPracticeScenarioResponse.parse({
      id: chosen._id.toString(),
      vector: chosen.vector,
      sender: chosen.sender,
      subject: chosen.subject,
      body: chosen.body,
      links: chosen.links,
      attachments: chosen.attachments,
      difficulty: chosen.difficulty,
    }),
  );
});
