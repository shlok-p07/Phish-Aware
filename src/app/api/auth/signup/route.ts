import { NextRequest } from "next/server";
import { MongoServerError } from "mongodb";
import { usersCollection } from "@/db";
import { SignupBody, SignupResponse } from "@/api-zod";
import { hashPassword } from "@/server/password";
import { buildUserDoc } from "@/server/users";
import {
  createSession,
  destroySession,
  getUserIdFromRequest,
} from "@/server/session";
import { toUserDto } from "@/server/dto";
import { normalizeEmail } from "@/server/sso/domain";
import { json, error, withErrorHandling, readJsonBody } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = SignupBody.parse(await readJsonBody(req));
  // Lowercased so "Alice@acme.com" and "alice@acme.com" can't become two
  // accounts -- and so these rows match what an IdP returns on the SSO path.
  const email = normalizeEmail(body.email);
  const users = await usersCollection();
  const existing = await users.findOne({ email });
  if (existing) {
    return error(409, "An account with this email already exists.");
  }

  // If the caller is currently a guest, convert that account in place so all
  // their guest progress (XP, streak, attempts, badges) carries over.
  const currentUserId = await getUserIdFromRequest();
  if (currentUserId) {
    const current = await users.findOne({ _id: currentUserId });
    if (current?.isGuest) {
      const upgraded = await users.findOneAndUpdate(
        { _id: currentUserId },
        {
          $set: {
            name: body.name,
            email,
            passwordHash: hashPassword(body.password),
            isGuest: false,
            updatedAt: new Date(),
            lastLoginAt: new Date(),
          },
        },
        { returnDocument: "after" },
      );
      // Swap the short-lived guest session for a full-length one.
      await destroySession();
      await createSession(upgraded!._id);
      return json(SignupResponse.parse(toUserDto(upgraded!)), { status: 201 });
    }
  }

  const user = buildUserDoc({
    name: body.name,
    email,
    passwordHash: hashPassword(body.password),
    lastLoginAt: new Date(),
  });
  try {
    await users.insertOne(user);
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return error(409, "An account with this email already exists.");
    }
    throw err;
  }
  await createSession(user._id);
  return json(SignupResponse.parse(toUserDto(user)), { status: 201 });
});
