import { db, usersTable } from "@/db";
import { ContinueAsGuestResponse } from "@/api-zod";
import {
  createSession,
  purgeExpiredGuests,
  GUEST_SESSION_TTL_MS,
} from "@/server/session";
import { toUserDto } from "@/server/dto";
import { json, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async () => {
  // Clean up any guest accounts whose hour has elapsed before creating a new one.
  await purgeExpiredGuests();
  const [user] = await db
    .insert(usersTable)
    .values({
      name: "Guest",
      isGuest: true,
    })
    .returning();
  await createSession(user!.id, GUEST_SESSION_TTL_MS);
  return json(ContinueAsGuestResponse.parse(toUserDto(user!)), { status: 201 });
});
