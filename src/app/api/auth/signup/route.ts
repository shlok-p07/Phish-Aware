import { NextRequest } from "next/server";
import { db, usersTable } from "@/db";
import { eq } from "drizzle-orm";
import { SignupBody, SignupResponse } from "@/api-zod";
import { hashPassword } from "@/server/password";
import {
  createSession,
  destroySession,
  getUserIdFromRequest,
} from "@/server/session";
import { toUserDto } from "@/server/dto";
import { json, error, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = SignupBody.parse(await req.json());
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, body.email))
    .limit(1);
  if (existing) {
    return error(409, "An account with this email already exists.");
  }

  // If the caller is currently a guest, convert that account in place so all
  // their guest progress (XP, streak, attempts, badges) carries over.
  const currentUserId = await getUserIdFromRequest();
  if (currentUserId) {
    const [current] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, currentUserId))
      .limit(1);
    if (current?.isGuest) {
      const [upgraded] = await db
        .update(usersTable)
        .set({
          name: body.name,
          email: body.email,
          passwordHash: hashPassword(body.password),
          isGuest: false,
        })
        .where(eq(usersTable.id, currentUserId))
        .returning();
      // Swap the short-lived guest session for a full-length one.
      await destroySession();
      await createSession(upgraded!.id);
      return json(SignupResponse.parse(toUserDto(upgraded!)), { status: 201 });
    }
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      name: body.name,
      email: body.email,
      passwordHash: hashPassword(body.password),
      isGuest: false,
    })
    .returning();
  await createSession(user!.id);
  return json(SignupResponse.parse(toUserDto(user!)), { status: 201 });
});
