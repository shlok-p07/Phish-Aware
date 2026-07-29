import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import {
  organizationsCollection,
  usersCollection,
  campaignsCollection,
  assignmentsCollection,
  type OrganizationDoc,
} from "@/db";
import { json, error, requireUserId, requireOrgAdmin, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

function toOrgDto(org: OrganizationDoc) {
  return {
    id: org._id.toString(),
    name: org.name,
    ssoDomain: org.domain ?? "",
    seatLimit: org.settings.seatLimit,
  };
}

/** Fetch the current user's org, or 404 if they don't belong to one yet. */
export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (!user?.orgId) {
    return error(404, "You don't belong to an organization yet");
  }
  const orgs = await organizationsCollection();
  const org = await orgs.findOne({ _id: user.orgId });
  if (!org) {
    return error(404, "You don't belong to an organization yet");
  }
  return json(toOrgDto(org));
});

/** Create an organization and make the current user its admin. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = (await req.json()) as { name: string; ssoDomain?: string };
  const name = body.name?.trim();
  if (!name) {
    return error(400, "Organization name is required");
  }
  const domain = body.ssoDomain?.trim() || null;

  const users = await usersCollection();
  const user = await users.findOne({ _id: userId });
  if (user?.orgId) {
    return error(409, "You already belong to an organization");
  }

  const orgs = await organizationsCollection();
  const org: OrganizationDoc = {
    _id: new ObjectId(),
    name,
    domain,
    ssoProvider: null,
    settings: { seatLimit: 50 },
    createdAt: new Date(),
  };
  await orgs.insertOne(org);
  await users.updateOne({ _id: userId }, { $set: { orgId: org._id, role: "admin" } });

  return json(toOrgDto(org), { status: 201 });
});

/** Delete the organization: unassign every member, remove its training data. */
export const DELETE = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const orgs = await organizationsCollection();
  const users = await usersCollection();
  const campaigns = await campaignsCollection();
  const assignments = await assignmentsCollection();

  await assignments.deleteMany({ orgId: admin.orgId });
  await campaigns.deleteMany({ orgId: admin.orgId });
  await users.updateMany({ orgId: admin.orgId }, { $set: { orgId: null, role: "employee" } });
  await orgs.deleteOne({ _id: admin.orgId });

  return new Response(null, { status: 204 });
});
