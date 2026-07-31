import { NextRequest } from "next/server";
import { usersCollection } from "@/db";
import { LoginBody, LoginResponse } from "@/api-zod";
import { verifyPassword } from "@/server/password";
import { createSession } from "@/server/session";
import { toUserDto } from "@/server/dto";
import { normalizeEmail } from "@/server/sso/domain";
import { rateLimit, clientIp } from "@/server/rateLimit";
import { json, error, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = LoginBody.parse(await req.json());
  const email = normalizeEmail(body.email);

  const limit = rateLimit(`login:${clientIp(req.headers)}:${email}`, 10, 60_000);
  if (!limit.ok) {
    return error(429, "Too many sign-in attempts. Try again in a minute.");
  }

  const users = await usersCollection();

  // The users indexes allow the same address once per org PLUS once orgless
  // (see the two partial uniques in src/db/provision.ts), so this can legally
  // return more than one row. Verifying against each and requiring exactly one
  // match is the honest resolution -- "first one wins" would silently pick an
  // account, and which one it picked would depend on index order.
  const candidates = await users.find({ email }).toArray();
  const matches = candidates.filter(
    (candidate) => candidate.passwordHash && verifyPassword(body.password, candidate.passwordHash),
  );

  if (matches.length === 0) {
    return error(401, "Invalid email or password.");
  }
  if (matches.length > 1) {
    return error(
      409,
      "Multiple accounts use this email. Sign in with your organization's single sign-on, or contact your administrator.",
    );
  }

  const user = matches[0]!;
  if (user.status === "disabled") {
    return error(403, "This account has been disabled. Contact your organization administrator.");
  }
  if (user.status === "invited") {
    return error(403, "Finish setting up your account using the invitation link you were sent.");
  }

  await createSession(user._id);
  const lastLoginAt = new Date();
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt } });
  return json(LoginResponse.parse(toUserDto({ ...user, lastLoginAt })));
});
