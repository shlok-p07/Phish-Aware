import { Router, type IRouter } from "express";
import { db, scenariosTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetOnboardingQuizResponse, SubmitOnboardingQuizBody, SubmitOnboardingQuizResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { levelForXp } from "../lib/leveling";

const router: IRouter = Router();

router.get("/onboarding/quiz", requireAuth, async (_req, res) => {
  const scenarios = await db.select().from(scenariosTable).where(eq(scenariosTable.isOnboarding, true));
  const questions = scenarios.map((s) => ({
    id: String(s.id),
    vector: s.vector as "email" | "sms" | "voice" | "qr" | "social" | "website",
    sender: s.sender,
    subject: s.subject,
    body: s.body,
    links: s.links,
  }));
  res.json(GetOnboardingQuizResponse.parse(questions));
});

router.post("/onboarding/submit", requireAuth, async (req, res) => {
  const body = SubmitOnboardingQuizBody.parse(req.body);
  const scenarioIds = body.answers.map((a) => Number(a.scenarioId));
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

  await db.update(usersTable).set({ xp: startingXp, level }).where(eq(usersTable.id, req.userId!));

  res.json(
    SubmitOnboardingQuizResponse.parse({
      level,
      correctCount,
      totalCount,
    }),
  );
  void scenarioIds;
});

export default router;
