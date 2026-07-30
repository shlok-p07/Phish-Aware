import { scenariosCollection } from "@/db";
import { GetOnboardingQuizResponse } from "@/api-zod";
import { json, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  await requireUserId();
  const scenarios = await (await scenariosCollection()).find({ isOnboarding: true }).toArray();
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
