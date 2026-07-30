import { usersCollection } from "@/db";
import { computeMemberStats, riskLevelForAccuracy } from "@/server/orgAnalytics";
import { json, requireOrgAdmin, withErrorHandling } from "@/server/http";
import { percent, round2 } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const users = await usersCollection();
  const members = await users.find({ orgId: admin.orgId }).toArray();
  const active = members.filter((m) => m.status === "active");
  const stats = await computeMemberStats(active.map((m) => m._id));

  const perMember = active.map((m) => {
    const s = stats.get(m._id.toString())!;
    return { name: m.name, accuracy: s.accuracy, risk: riskLevelForAccuracy(s.accuracy, s.totalAttempts) };
  });

  const n = active.length || 1;
  const avgAccuracy = round2(perMember.reduce((sum, m) => sum + m.accuracy, 0) / n);
  const atRisk = perMember.filter((m) => m.risk === "high").length;
  const riskBands = {
    low: perMember.filter((m) => m.risk === "low").length,
    medium: perMember.filter((m) => m.risk === "medium").length,
    high: perMember.filter((m) => m.risk === "high").length,
  };
  // Lesson-completion isn't tracked anywhere in the app yet (only practice
  // attempts are) -- "participation rate" (has this member logged at least
  // one practice attempt?) is the honest real-data proxy for engagement,
  // rather than fabricating a lesson-completion number with no backing data.
  const participationRate = percent(
    active.filter((m) => (stats.get(m._id.toString())?.totalAttempts ?? 0) > 0).length / n,
  );

  return json({
    avgAccuracy,
    activeCount: active.length,
    atRisk,
    riskBands,
    participationRate,
    perMember,
  });
});
