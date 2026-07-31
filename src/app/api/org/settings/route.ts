import { NextRequest } from "next/server";
import { organizationsCollection } from "@/db";
import { json, requireOrgAdmin, withErrorHandling } from "@/server/http";
import { toOrgDto } from "@/server/org";

export const dynamic = "force-dynamic";

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireOrgAdmin();
  const body = (await req.json()) as { name?: string; ssoDomain?: string; seatLimit?: number };

  const orgs = await organizationsCollection();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.ssoDomain !== undefined) update.domain = body.ssoDomain.trim().toLowerCase() || null;
  if (body.seatLimit !== undefined) update["settings.seatLimit"] = Number(body.seatLimit) || 0;

  const org = await orgs.findOneAndUpdate(
    { _id: admin.orgId },
    { $set: update },
    { returnDocument: "after" },
  );

  return json(toOrgDto(org!));
});
