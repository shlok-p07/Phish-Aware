import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import {
  campaignsCollection,
  assignmentsCollection,
  usersCollection,
  toObjectId,
  specDefaults,
} from "@/db";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";

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
      createdAt: c.createdAt.toISOString(),
    })),
  );
});

/** Create a training campaign and fan out per-member assignments. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  const body = (await req.json()) as {
    title: string;
    target: string; // "all" or a member's user id
    dueDate: string;
    requiredScenarios?: number;
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
