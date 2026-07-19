import { db, usersTable } from "@/db";
import { ContinueAsGuestResponse } from "@/api-zod";
import { createSession } from "@/server/session";
import { toUserDto } from "@/server/dto";
import { json, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async () => {
  const [user] = await db
    .insert(usersTable)
    .values({
      name: "Guest",
      isGuest: true,
    })
    .returning();
  await createSession(user!.id);
  return json(ContinueAsGuestResponse.parse(toUserDto(user!)), { status: 201 });
});
