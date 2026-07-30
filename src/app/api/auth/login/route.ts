import { NextRequest } from "next/server";
import { usersCollection } from "@/db";
import { LoginBody, LoginResponse } from "@/api-zod";
import { verifyPassword } from "@/server/password";
import { createSession } from "@/server/session";
import { toUserDto } from "@/server/dto";
import { json, error, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = LoginBody.parse(await req.json());
  const users = await usersCollection();
  const user = await users.findOne({ email: body.email });
  if (!user || !user.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
    return error(401, "Invalid email or password.");
  }
  await createSession(user._id);
  return json(LoginResponse.parse(toUserDto(user)));
});
