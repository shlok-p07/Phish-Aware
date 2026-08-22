import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import {
  campaignsCollection,
  assignmentsCollection,
  usersCollection,
  attemptsCollection,
  scenariosCollection,
  toObjectId,
} from "@/db";
import { assignmentProgress, attemptsByUser, describeFocus } from "@/server/trainingProgress";
import { error, requireOrgAdmin, withErrorHandling, json } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * A campaign and who has actually done it.
 *
 * An admin could create mandatory training and had no way to see whether anybody
 * completed it -- this route only supported DELETE. Progress comes from the same
 * helper the employee's own view uses, so the two cannot disagree about whether
 * somebody is finished.
 */
export const GET = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const campaignId = toObjectId(id);
    if (!campaignId) {
      return error(400, "Invalid campaign id");
    }

    const campaigns = await campaignsCollection();
    const campaign = await campaigns.findOne({ _id: campaignId, orgId: admin.orgId });
    if (!campaign) {
      return error(404, "Campaign not found");
    }

    const assignments = await (await assignmentsCollection())
      .find({ campaignId, orgId: admin.orgId })
      .toArray();
    const userIds = assignments.map((a) => a.userId);
    const [users, attemptRows] = await Promise.all([
      (await usersCollection()).find({ _id: { $in: userIds } }).toArray(),
      userIds.length
        ? (await attemptsCollection()).find({ userId: { $in: userIds } }).toArray()
        : Promise.resolve([]),
    ]);
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    // The scenarios behind those attempts, so a focused campaign counts only the
    // practice it asked for -- the same judgement the member's own view makes.
    const scenarioIds = [...new Set(attemptRows.map((a) => a.scenarioId.toString()))]
      .map(toObjectId)
      .filter((id): id is ObjectId => id !== null);
    const scenarioRows = scenarioIds.length
      ? await (await scenariosCollection())
          .find({ _id: { $in: scenarioIds } }, { projection: { vector: 1, difficulty: 1, cues: 1 } })
          .toArray()
      : [];
    const byScenario = new Map(scenarioRows.map((sc) => [sc._id.toString(), sc]));
    const grouped = attemptsByUser(
      attemptRows.map((a) => {
        const scenario = byScenario.get(a.scenarioId.toString());
        return {
          userId: a.userId,
          createdAt: a.createdAt,
          vector: scenario?.vector,
          difficulty: scenario?.difficulty,
          cues: (scenario?.cues ?? []).map((c) => c.type),
        };
      }),
    );

    const required = campaign.requiredScenarios ?? 0;
    const dueDate = campaign.dueDate ?? null;
    const now = new Date();

    const members = assignments.flatMap((assignment) => {
      const user = userById.get(assignment.userId.toString());
      // A deleted account leaves nothing to chase; showing a nameless row would
      // read as an outstanding obligation that nobody can act on.
      if (!user) {
        return [];
      }
      return [
        {
          id: user._id.toString(),
          name: user.name,
          department: user.department ?? null,
          ...assignmentProgress({
            assignedAt: assignment.createdAt,
            requiredScenarios: required,
            dueDate,
            attempts: grouped.get(assignment.userId.toString()) ?? [],
            focus: campaign.focus ?? null,
            now,
          }),
        },
      ];
    });

    // Furthest from done first: this list exists to be worked through.
    const rank = { overdue: 0, assigned: 1, in_progress: 2, completed: 3 } as const;
    members.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));

    return json({
      id: campaign._id.toString(),
      title: campaign.name,
      target: campaign.target ?? "all",
      dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      requiredScenarios: required,
      focus: campaign.focus ?? null,
      focusLabel: describeFocus(campaign.focus ?? null),
      members,
    });
  },
);

export const DELETE = withErrorHandling(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireOrgAdmin();
    const { id } = await ctx.params;
    const campaignId = toObjectId(id);
    if (!campaignId) {
      return error(400, "Invalid campaign id");
    }

    const campaigns = await campaignsCollection();
    const result = await campaigns.deleteOne({ _id: campaignId, orgId: admin.orgId });
    if (result.deletedCount === 0) {
      return error(404, "Assignment not found");
    }
    const assignments = await assignmentsCollection();
    await assignments.deleteMany({ campaignId });

    return new Response(null, { status: 204 });
  },
);
