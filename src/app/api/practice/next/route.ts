import { db, scenariosTable, attemptsTable } from "@/db";
import { and, eq } from "drizzle-orm";
import { GetNextPracticeScenarioResponse } from "@/api-zod";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();

  const pool = await db
    .select()
    .from(scenariosTable)
    .where(and(eq(scenariosTable.vector, "email"), eq(scenariosTable.isOnboarding, false)));

  if (pool.length === 0) {
    return error(404, "No practice scenarios available");
  }

  const attempted = await db.select().from(attemptsTable).where(eq(attemptsTable.userId, userId));
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

  return json(
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
