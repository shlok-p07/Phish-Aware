import { db, scenariosTable } from "@/db";
import { eq } from "drizzle-orm";
import { GetOnboardingQuizResponse } from "@/api-zod";
import { json, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  await requireUserId();
  const scenarios = await db
    .select()
    .from(scenariosTable)
    .where(eq(scenariosTable.isOnboarding, true));
  const questions = scenarios.map((s) => ({
    id: String(s.id),
    vector: s.vector as "email" | "sms" | "voice" | "qr" | "social" | "website",
    sender: s.sender,
    subject: s.subject,
    body: s.body,
    links: s.links,
  }));
  return json(GetOnboardingQuizResponse.parse(questions));
});
