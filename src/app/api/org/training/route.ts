import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import {
  campaignsCollection,
  assignmentsCollection,
  usersCollection,
  toObjectId,
  specDefaults,
} from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling, readJsonBody } from "@/server/http";
import { recordAudit } from "@/server/audit";
import { assignmentNotification, notifyOnce } from "@/server/notifications";
import { parseTrainingTarget } from "@/lib/trainingTarget";
import { findOrgDepartment } from "@/server/departments";
import { PRACTICE_VECTORS } from "@/server/attackProfiles";
import { CUE_LABELS } from "@/server/cues";
import type { CampaignFocus } from "@/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const campaigns = await campaignsCollection();
  const list = await campaigns.find({ orgId: admin.orgId }).sort({ createdAt: -1 }).toArray();

  return json(
    list.map((c) => ({
      id: c._id.toString(),
      title: c.name,
      target: c.target,
      dueDate: c.dueDate ? c.dueDate.toISOString().slice(0, 10) : null,
      requiredScenarios: c.requiredScenarios,
      focus: c.focus ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  );
});

/** Create a training campaign and fan out per-member assignments. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  const body = (await readJsonBody(req)) as {
    title: string;
    target: string; // "all", "department:<Name>", or a member's user id
    dueDate: string;
    requiredScenarios?: number;
    focus?: { vectors?: unknown; minDifficulty?: unknown; cues?: unknown } | null;
  };
  const title = body.title?.trim();
  if (!title || !body.dueDate) {
    return error(400, "Title and due date are required");
  }

  const users = await usersCollection();
  let targetUserIds: ObjectId[];
  if (body.target === "all") {
    const members = await users.find({ orgId: admin.orgId }, { projection: { _id: 1 } }).toArray();
    targetUserIds = members.map((m) => m._id);
  } else if (body.target?.startsWith("department:")) {
    // Assigning a department is the normal enterprise case: the finance team
    // gets invoice-fraud training, not the whole company one member at a time.
    const parsed = parseTrainingTarget(body.target);
    if (parsed?.kind !== "department") {
      return error(400, "That isn't a department we recognize");
    }
    // Checked against this organization's own departments, which is the only
    // place that knows what they are.
    const match = await findOrgDepartment(admin.orgId, parsed.department);
    if (!match) {
      return error(400, "That isn't a department in your organization");
    }
    const department = match.name;
    const members = await users
      .find({ orgId: admin.orgId, department }, { projection: { _id: 1 } })
      .toArray();
    if (members.length === 0) {
      // Silently creating a campaign nobody is assigned to looks like success
      // and then never appears in anyone's queue.
      return error(409, `Nobody is currently assigned to ${department}.`);
    }
    targetUserIds = members.map((m) => m._id);
  } else {
    const memberId = toObjectId(body.target);
    if (!memberId) {
      return error(400, "Invalid target member id");
    }
    const member = await users.findOne({ _id: memberId, orgId: admin.orgId });
    if (!member) {
      return error(404, "Target member not found");
    }
    targetUserIds = [memberId];
  }

  const campaigns = await campaignsCollection();
  // What the campaign trains. Validated rather than stored as sent: a vector or
  // cue nobody recognises would silently make the requirement impossible to
  // discharge, and the member would practise forever at 0 of 5.
  let focus: CampaignFocus | null = null;
  if (body.focus) {
    const vectors = Array.isArray(body.focus.vectors)
      ? body.focus.vectors.filter((v): v is string => typeof v === "string")
      : [];
    const cues = Array.isArray(body.focus.cues)
      ? body.focus.cues.filter((c): c is string => typeof c === "string")
      : [];
    const unknownVector = vectors.find(
      (v) => !(PRACTICE_VECTORS as readonly string[]).includes(v),
    );
    if (unknownVector) {
      return error(400, `Unknown practice vector: ${unknownVector}`);
    }
    const unknownCue = cues.find((c) => !(c in CUE_LABELS));
    if (unknownCue) {
      return error(400, `Unknown red flag: ${unknownCue}`);
    }
    const minDifficulty = Number(body.focus.minDifficulty ?? 1);
    if (!Number.isInteger(minDifficulty) || minDifficulty < 1 || minDifficulty > 5) {
      return error(400, "Minimum difficulty must be a whole number between 1 and 5");
    }
    // All three empty is the same as no focus at all; storing it would imply a
    // constraint that does not exist.
    if (vectors.length > 0 || cues.length > 0 || minDifficulty > 1) {
      focus = { vectors, minDifficulty, cues };
    }
  }

  const campaignId = new ObjectId();
  const campaign = {
    _id: campaignId,
    campaignId,
    orgId: admin.orgId,
    type: "training" as const,
    name: title,
    scenarioIds: [],
    lessonIds: [],
    audience: {},
    dueDate: new Date(body.dueDate),
    status: "active" as const,
    createdBy: admin._id,
    target: body.target,
    requiredScenarios: Number(body.requiredScenarios) || 0,
    focus,
    ...specDefaults(),
  };
  await campaigns.insertOne(campaign);

  const assignments = await assignmentsCollection();
  if (targetUserIds.length > 0) {
    await assignments.insertMany(
      targetUserIds.map((userId) => {
        const id = new ObjectId();
        return {
          _id: id,
          assignmentId: id,
          campaignId: campaign._id,
          userId,
          orgId: admin.orgId,
          status: "assigned" as const,
          progress: 0,
          completedAt: null,
          ...specDefaults(),
        };
      }),
    );
  }

  // Tell the people it was assigned to. A mandatory campaign that lapses in
  // silence is a campaign nobody does, and the dashboard was the only place it
  // appeared -- which only helps somebody who was already looking.
  await Promise.all(
    targetUserIds.map((userId) =>
      notifyOnce({
        userId,
        orgId: admin.orgId,
        type: "assignment",
        ...assignmentNotification(title, campaign.dueDate ?? null),
        subjectId: campaignId,
      }),
    ),
  );

  await recordAudit({
    orgId: admin.orgId,
    actorId: admin._id,
    action: "training.created",
    targetType: "campaign",
    targetId: campaignId,
    metadata: { title, target: body.target, assigned: targetUserIds.length },
    headers: req.headers,
  });

  return json(
    {
      id: campaign._id.toString(),
      title: campaign.name,
      target: campaign.target,
      dueDate: campaign.dueDate.toISOString().slice(0, 10),
      requiredScenarios: campaign.requiredScenarios,
      createdAt: campaign.createdAt.toISOString(),
    },
    { status: 201 },
  );
});
