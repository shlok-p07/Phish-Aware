import { scenariosCollection } from "@/db";
import { GetOnboardingQuizResponse } from "@/api-zod";
import { json, requireUserId, withErrorHandling } from "@/server/http";
import { selectQuizScenarios } from "@/server/onboardingQuiz";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  await requireUserId();
  const all = await (await scenariosCollection()).find({ isOnboarding: true }).toArray();
  // Distinct, shuffled, capped at the length the contract promises. Serving the
  // raw query meant a duplicated seed row became a duplicated question -- see
  // the note in @/server/onboardingQuiz.
  const scenarios = selectQuizScenarios(all);
  const questions = scenarios.map((s) => ({
    id: s._id.toString(),
    vector: s.vector as "email" | "sms" | "voice" | "qr" | "social" | "web",
    sender: s.sender,
    subject: s.subject,
    body: s.body,
    links: s.links,
  }));
  return json(GetOnboardingQuizResponse.parse(questions));
});
