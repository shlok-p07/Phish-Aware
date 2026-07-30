import { NextRequest } from "next/server";
import { organizationsCollection } from "@/db";
import { json, requireOrgAdmin, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  const body = (await req.json()) as { name?: string; ssoDomain?: string; seatLimit?: number };

  const orgs = await organizationsCollection();
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.ssoDomain !== undefined) update.domain = body.ssoDomain.trim() || null;
  if (body.seatLimit !== undefined) update["settings.seatLimit"] = Number(body.seatLimit) || 0;

  const org = await orgs.findOneAndUpdate(
    { _id: admin.orgId },
    { $set: update },
    { returnDocument: "after" },
  );

  return json({
    id: org!._id.toString(),
    name: org!.name,
    ssoDomain: org!.domain ?? "",
    seatLimit: org!.settings.seatLimit,
  });
});
