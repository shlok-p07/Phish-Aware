import { NextRequest } from "next/server";
import { ObjectId, MongoServerError } from "mongodb";
import { usersCollection, specDefaults, type OrgRole } from "@/db";
import { computeMemberStats, riskLevelForAccuracy } from "@/server/orgAnalytics";
import { json, error, requireOrgAdmin, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const admin = await requireOrgAdmin();
  const users = await usersCollection();
  const members = await users.find({ orgId: admin.orgId }).toArray();
  const stats = await computeMemberStats(members.map((m) => m._id));

  return json(
    members.map((m) => {
      const s = stats.get(m._id.toString())!;
      return {
        id: m._id.toString(),
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status,
        joinedAt: m.status === "active" ? m.createdAt.toISOString() : null,
        accuracy: s.accuracy,
        riskLevel: riskLevelForAccuracy(s.accuracy, s.totalAttempts),
      };
    }),
  );
});

/** Invite a member: creates the user account directly with status "invited". */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  const body = (await req.json()) as { name?: string; email: string; role?: OrgRole };
  const email = body.email?.trim();
  if (!email) {
    return error(400, "Email is required");
  }
  const name = body.name?.trim() || email.split("@")[0]!;
  const role: OrgRole = body.role === "admin" ? "admin" : "employee";

  const users = await usersCollection();
  const id = new ObjectId();
  const member = {
    _id: id,
    userId: id,
    orgId: admin.orgId,
    name,
    email,
    passwordHash: null,
    isGuest: false,
    level: "beginner",
    xp: 0,
    streak: 0,
    lastActiveDate: null,
    badges: [],
    calibrationScore: 0,
    onboardingCompleted: false,
    role,
    status: "invited" as const,
    ...specDefaults(),
  };
  try {
    await users.insertOne(member);
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return error(409, "A member with this email already exists");
    }
    throw err;
  }

  return json(
    {
      id: member._id.toString(),
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
      joinedAt: null,
      accuracy: 0,
      riskLevel: "high",
    },
    { status: 201 },
  );
});
