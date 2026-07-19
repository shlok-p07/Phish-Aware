import { NextRequest } from "next/server";
import { db, scenariosTable, usersTable } from "@/db";
import { eq } from "drizzle-orm";
import { SubmitOnboardingQuizBody, SubmitOnboardingQuizResponse } from "@/api-zod";
import { levelForXp } from "@/server/leveling";
import { json, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = SubmitOnboardingQuizBody.parse(await req.json());
  const scenarios = await db.select().from(scenariosTable);
  const scenarioMap = new Map(scenarios.map((s) => [s.id, s]));

  let correctCount = 0;
  for (const answer of body.answers) {
    const scenario = scenarioMap.get(Number(answer.scenarioId));
    if (scenario && scenario.isPhish === answer.verdict) {
      correctCount++;
    }
  }
  const totalCount = body.answers.length;
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

  // Starting level based on diagnostic accuracy, with a small XP head start.
  const startingXp = Math.round(accuracy * 120);
  const level = levelForXp(startingXp);

  await db.update(usersTable).set({ xp: startingXp, level }).where(eq(usersTable.id, userId));

  return json(
    SubmitOnboardingQuizResponse.parse({
      level,
      correctCount,
      totalCount,
    }),
  );
});
