import { scenariosCollection, attemptsCollection } from "@/db";
import { GetNextPracticeScenarioResponse } from "@/api-zod";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();

  const pool = await (await scenariosCollection())
    .find({ vector: "email", isOnboarding: false })
    .toArray();

  if (pool.length === 0) {
    return error(404, "No practice scenarios available");
  }

  const attempted = await (await attemptsCollection()).find({ userId }).toArray();
  const attemptedIds = new Set(attempted.map((a) => a.scenarioId.toString()));

  // Prefer scenarios the user hasn't seen yet; if all seen, weight toward their weak cues.
  let candidates = pool.filter((s) => !attemptedIds.has(s._id.toString()));
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
