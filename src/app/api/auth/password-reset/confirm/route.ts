import { NextRequest } from "next/server";
import { usersCollection } from "@/db";
import { ConfirmPasswordResetBody } from "@/api-zod";
import { hashPassword, verifyPassword } from "@/server/password";
import { normalizeEmail } from "@/server/sso/domain";
import { rateLimit, clientIp } from "@/server/rateLimit";
import { json, error, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = ConfirmPasswordResetBody.parse(await req.json());
  const email = normalizeEmail(body.email);

  const limit = rateLimit(`password-reset-confirm:${clientIp(req.headers)}:${email}`, 10, 60_000);
  if (!limit.ok) {
    return error(429, "Too many attempts. Try again in a minute.");
  }

  const users = await usersCollection();
  const candidates = await users.find({ email, passwordResetCodeHash: { $ne: null } }).toArray();

  const now = new Date();
  const match = candidates.find(
    (candidate) =>
      candidate.passwordResetCodeHash &&
      candidate.passwordResetExpiresAt &&
      candidate.passwordResetExpiresAt > now &&
      verifyPassword(body.code, candidate.passwordResetCodeHash),
  );

  if (!match) {
    return error(400, "That code is invalid or has expired. Request a new one.");
  }

  await users.updateOne(
    { _id: match._id },
    {
      $set: {
        passwordHash: hashPassword(body.newPassword),
        passwordResetCodeHash: null,
        passwordResetExpiresAt: null,
        updatedAt: now,
      },
    },
  );

  return json({ ok: true });
});
