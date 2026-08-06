import { NextRequest } from "next/server";
import { usersCollection } from "@/db";
import { LoginBody, LoginResponse } from "@/api-zod";
import { verifyPassword } from "@/server/password";
import { createSession } from "@/server/session";
import { toUserDto } from "@/server/dto";
import { normalizeEmail } from "@/server/sso/domain";
import { rateLimit, clientIp } from "@/server/rateLimit";
import {
  ACCOUNT_LOCKED_CODE,
  PASSWORD_RESET_REQUIRED_CODE,
  RESET_REQUIRED_MESSAGE,
  clearedLockoutFields,
  isLocked,
  lockedMessage,
  mustResetPassword,
  recordFailedAttempt,
} from "@/server/loginLockout";
import { json, error, withErrorHandling, HttpError } from "@/server/http";

export const dynamic = "force-dynamic";

/** 423 Locked, with the code the auth page keys its unlock banner off. */
function lockedError(lockedUntil: Date, now: Date): HttpError {
  return new HttpError(423, lockedMessage(lockedUntil, now), ACCOUNT_LOCKED_CODE);
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = LoginBody.parse(await req.json());
  const email = normalizeEmail(body.email);

  const limit = rateLimit(`login:${clientIp(req.headers)}:${email}`, 10, 60_000);
  if (!limit.ok) {
    return error(429, "Too many sign-in attempts. Try again in a minute.");
  }

  const users = await usersCollection();
  const now = new Date();

  // The users indexes allow the same address once per org PLUS once orgless
  // (see the two partial uniques in src/db/provision.ts), so this can legally
  // return more than one row. Verifying against each and requiring exactly one
  // match is the honest resolution -- "first one wins" would silently pick an
  // account, and which one it picked would depend on index order.
  const candidates = await users.find({ email }).toArray();
  const withPassword = candidates.filter((candidate) => candidate.passwordHash);

  // Locked accounts are dropped before the password is checked at all, so a
  // correct guess during the lock window neither signs anyone in nor reveals
  // that it was correct.
  const unlocked = withPassword.filter((candidate) => !isLocked(candidate, now));

  if (withPassword.length > 0 && unlocked.length === 0) {
    const soonest = withPassword
      .map((candidate) => candidate.lockedUntil!)
      .reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
    throw lockedError(soonest, now);
  }

  const matches = unlocked.filter((candidate) =>
    verifyPassword(body.password, candidate.passwordHash!),
  );

  if (matches.length === 0) {
    // Charge the failure to every account that could have been the target.
    // Normally that's exactly one; the multi-account case is the same edge the
    // comment above describes, and guessing wrong for a shared address should
    // not leave one of them un-penalised.
    const locks = await Promise.all(
      unlocked.map((candidate) => recordFailedAttempt(users, candidate, now)),
    );
    const tripped = locks.filter((lock): lock is Date => lock !== null);
    if (tripped.length > 0) {
      throw lockedError(tripped[0]!, now);
    }
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
  // The lock has expired but the account was locked out at some point, so the
  // password is treated as burned until it's been changed.
  if (mustResetPassword(user)) {
    throw new HttpError(403, RESET_REQUIRED_MESSAGE, PASSWORD_RESET_REQUIRED_CODE);
  }

  await createSession(user._id);
  const lastLoginAt = now;
  await users.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt, ...clearedLockoutFields() } },
  );
  return json(LoginResponse.parse(toUserDto({ ...user, lastLoginAt })));
});
