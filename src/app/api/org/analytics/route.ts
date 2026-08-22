import { usersCollection } from "@/db";
import { computeMemberStats, riskLevelForAccuracy } from "@/server/orgAnalytics";
import { json, requireOrgAdmin, withErrorHandling } from "@/server/http";
import { percent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const users = await usersCollection();
  const members = await users.find({ orgId: admin.orgId }).toArray();
  const active = members.filter((m) => m.status === "active");
  const stats = await computeMemberStats(active.map((m) => m._id));

  const perMember = active.map((m) => {
    const s = stats.get(m._id.toString())!;
    return {
      name: m.name,
      // Whole numbers, because that is what the contract declares and what an
      // admin dashboard should show. Banding uses the precise value so a member
      // just under a boundary is not rounded across it.
      accuracy: Math.round(s.accuracy),
      risk: riskLevelForAccuracy(s.accuracy, s.totalAttempts),
    };
  });

  const n = active.length || 1;
  const avgAccuracy = Math.round(perMember.reduce((sum, m) => sum + m.accuracy, 0) / n);
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

  // Grouped by department so an admin can see where the risk actually sits.
  // An org-wide average hides the case this product exists for: one department
  // handling invoices at 40% while the org sits at a comfortable 80%. Members
  // with no department assigned are kept as their own group rather than
  // dropped, so the numbers still reconcile with activeCount.
  const byDepartment = new Map<string | null, { accuracy: number; risk: string }[]>();
  active.forEach((m, i) => {
    const key = m.department ?? null;
    const group = byDepartment.get(key) ?? [];
    group.push(perMember[i]);
    byDepartment.set(key, group);
  });
  const perDepartment = [...byDepartment.entries()]
    .map(([department, group]) => ({
      department,
      memberCount: group.length,
      avgAccuracy: Math.round(group.reduce((sum, m) => sum + m.accuracy, 0) / group.length),
      atRisk: group.filter((m) => m.risk === "high").length,
    }))
    // Worst first: the point of the breakdown is to surface where to intervene.
    .sort((a, b) => a.avgAccuracy - b.avgAccuracy);

  return json({
    avgAccuracy,
    activeCount: active.length,
    atRisk,
    riskBands,
    participationRate,
    perMember,
    perDepartment,
  });
});
