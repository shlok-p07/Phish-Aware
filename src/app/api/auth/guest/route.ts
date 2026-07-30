import { ObjectId } from "mongodb";
import { usersCollection, specDefaults } from "@/db";
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
  const users = await usersCollection();
  const id = new ObjectId();
  const user = {
    _id: id,
    userId: id,
    orgId: null,
    name: "Guest",
    email: null,
    passwordHash: null,
    isGuest: true,
    level: "beginner",
    xp: 0,
    streak: 0,
    lastActiveDate: null,
    badges: [],
    calibrationScore: 0,
    onboardingCompleted: false,
    role: "employee" as const,
    status: "active" as const,
    ...specDefaults(),
  };
  await users.insertOne(user);
  await createSession(user._id, GUEST_SESSION_TTL_MS);
  return json(ContinueAsGuestResponse.parse(toUserDto(user)), { status: 201 });
});
