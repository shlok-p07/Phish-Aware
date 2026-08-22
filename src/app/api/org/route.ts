import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import {
  organizationsCollection,
  usersCollection,
  specDefaults,
  type OrganizationDoc,
  getDb,
} from "@/db";
import { json, error, requireUserId, requireOrgAdmin, withErrorHandling, readJsonBody } from "@/server/http";
import { ensureOrgDepartments } from "@/server/departments";
import { toOrgDtoWithSeats } from "@/server/org";
import { ORG_OWNED_COLLECTIONS } from "@/server/ownedData";

export const dynamic = "force-dynamic";

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
  return json(await toOrgDtoWithSeats(org));
});

/** Create an organization and make the current user its admin. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const body = (await readJsonBody(req)) as { name: string; ssoDomain?: string };
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
  const id = new ObjectId();
  const org: OrganizationDoc = {
    _id: id,
    orgId: id,
    name,
    domain,
    ssoProvider: null,
    settings: { seatLimit: 50 },
    ...specDefaults(),
  };
  await orgs.insertOne(org);

  // Give the new organization the standard department set straight away, so an
  // admin can file people immediately and so the first invite form has
  // something to offer. Additive: they can rename or delete any of them.
  await ensureOrgDepartments(id);
  await users.updateOne(
    { _id: userId },
    { $set: { orgId: org._id, role: "admin", updatedAt: new Date() } },
  );

  return json(await toOrgDtoWithSeats(org), { status: 201 });
});

/** Delete the organization: unassign every member, remove its training data. */
export const DELETE = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const orgs = await organizationsCollection();
  const users = await usersCollection();

  // Driven from ORG_OWNED_COLLECTIONS rather than named here one by one. This
  // handler cleaned campaigns and assignments and nothing else, so deleting an
  // organisation left its departments, invitations and audit trail pointing at a
  // tenant that no longer existed.
  //
  // The SSO connection was the costly one: enabled connections have a unique
  // index on allowedDomains, so one left behind claims that email domain for
  // good, and the next organisation to try it is told another organisation
  // already has it -- with no way to release it.
  const db = await getDb();
  for (const collection of ORG_OWNED_COLLECTIONS) {
    await db.collection(collection).deleteMany({ orgId: admin.orgId });
  }

  // Members are detached, not deleted: their account and history are theirs.
  await users.updateMany(
    { orgId: admin.orgId },
    { $set: { orgId: null, role: "employee", department: null, updatedAt: new Date() } },
  );
  await orgs.deleteOne({ _id: admin.orgId });

  return new Response(null, { status: 204 });
});
