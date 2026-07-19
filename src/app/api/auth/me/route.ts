import { db, usersTable } from "@/db";
import { eq } from "drizzle-orm";
import { GetCurrentUserResponse } from "@/api-zod";
import { toUserDto } from "@/server/dto";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    return error(401, "Not authenticated");
  }
  return json(GetCurrentUserResponse.parse(toUserDto(user)));
});
