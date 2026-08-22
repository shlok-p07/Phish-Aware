import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import {
  usersCollection,
  attemptsCollection,
  scenariosCollection,
  assignmentsCollection,
  campaignsCollection,
  toObjectId,
} from "@/db";
import { computeLearnerAnalytics } from "@/server/learnerAnalytics";
import { riskLevelForAccuracy } from "@/server/orgAnalytics";
import { assignmentProgress } from "@/server/trainingProgress";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";
import { percent } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * One member, in enough detail for an admin to act on.
 *
 * The members table showed a name, an accuracy figure and a risk badge, which
 * says somebody needs help without saying what kind. This is the drill-down: the
 * cues they miss, the vectors they miss them on, whether their confidence tracks
 * their competence, and what training they still owe.
 *
 * Derived by the same helper the member's own profile uses, so a manager and the
 * person they are managing never read different numbers for the same history.
 */
export const GET = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const memberId = toObjectId(id);
    if (!memberId) {
      return error(400, "Invalid member id");
    }

    const users = await usersCollection();
    const member = await users.findOne({ _id: memberId, orgId: admin.orgId });
    if (!member) {
      return error(404, "Member not found");
    }

    const attempts = await (await attemptsCollection()).find({ userId: memberId }).toArray();
    const referenced = [...new Set(attempts.map((a) => a.scenarioId.toString()))]
      .map(toObjectId)
      .filter((scenarioId): scenarioId is ObjectId => scenarioId !== null);
    const scenarios = referenced.length
      ? await (await scenariosCollection()).find({ _id: { $in: referenced } }).toArray()
      : [];

    const analytics = computeLearnerAnalytics(
      attempts,
      new Map(scenarios.map((scenario) => [scenario._id.toString(), scenario.vector])),
    );

    const correct = attempts.filter((a) => a.correct).length;
    const accuracy = attempts.length > 0 ? percent(correct / attempts.length) : 0;

    // Their outstanding obligations, scoped to this org: an assignment from a
    // previous employer is not this admin's business.
    const assignmentRows = await (await assignmentsCollection())
      .find({ userId: memberId, orgId: admin.orgId })
      .toArray();
    const campaignIds = [...new Set(assignmentRows.map((a) => a.campaignId.toString()))].map(
      (campaignId) => new ObjectId(campaignId),
    );
    const campaigns = campaignIds.length
      ? await (await campaignsCollection()).find({ _id: { $in: campaignIds } }).toArray()
      : [];
    const campaignById = new Map(campaigns.map((c) => [c._id.toString(), c]));
    const now = new Date();

    const assignments = assignmentRows.flatMap((assignment) => {
      const campaign = campaignById.get(assignment.campaignId.toString());
      if (!campaign) {
        return [];
      }
      const required = campaign.requiredScenarios ?? 0;
      const dueDate = campaign.dueDate ?? null;
      return [
        {
          id: assignment._id.toString(),
          title: campaign.name,
          dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
          requiredScenarios: required,
          ...assignmentProgress({
            assignedAt: assignment.createdAt,
            requiredScenarios: required,
            dueDate,
            attempts,
            now,
          }),
        },
      ];
    });

    return json({
      id: member._id.toString(),
      name: member.name,
      email: member.email ?? null,
      role: member.role,
      status: member.status ?? "active",
      department: member.department ?? null,
      joinedAt: member.createdAt ? member.createdAt.toISOString() : null,
      lastActiveAt: member.lastLoginAt ? member.lastLoginAt.toISOString() : null,
      accuracy: Math.round(accuracy),
      risk: riskLevelForAccuracy(accuracy, attempts.length),
      calibrationScore: Math.round(analytics.calibrationScore),
      totalAttempts: analytics.totalAttempts,
      // Weakest first: this view exists to answer "what do I do about this
      // person", and the answer is at the bottom of the ranking.
      cueAccuracy: [...analytics.cueAccuracy].sort((a, b) => a.rate - b.rate),
      vectorAccuracy: [...analytics.vectorAccuracy].sort((a, b) => a.rate - b.rate),
      assignments,
    });
  },
);
