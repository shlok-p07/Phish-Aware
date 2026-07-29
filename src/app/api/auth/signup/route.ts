import { NextRequest } from "next/server";
import { ObjectId, MongoServerError } from "mongodb";
import { usersCollection } from "@/db";
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
  const users = await usersCollection();
  const existing = await users.findOne({ email: body.email });
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
            email: body.email,
            passwordHash: hashPassword(body.password),
            isGuest: false,
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

  const now = new Date();
  const user = {
    _id: new ObjectId(),
    orgId: null,
    name: body.name,
    email: body.email,
    passwordHash: hashPassword(body.password),
    isGuest: false,
    level: "beginner",
    xp: 0,
    streak: 0,
    lastActiveDate: null,
    badges: [],
    calibrationScore: 0,
    onboardingCompleted: false,
    role: "employee" as const,
    status: "active" as const,
    createdAt: now,
  };
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
