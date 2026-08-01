import { NextRequest } from "next/server";
import { usersCollection } from "@/db";
import { RequestPasswordResetBody } from "@/api-zod";
import { hashPassword, generateResetCode } from "@/server/password";
import { normalizeEmail } from "@/server/sso/domain";
import { rateLimit, clientIp } from "@/server/rateLimit";
import { json, error, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

const CODE_VALID_MS = 15 * 60 * 1000;

/**
 * No email delivery in this app -- the code is returned directly and shown
 * in the UI rather than sent anywhere. That's a real tradeoff: a genuine
 * account gets a real code back and a non-existent one gets null, so this
 * (unlike an emailed code) reveals whether an address has an account.
 * Acceptable for this app's scope; would need rethinking before ever
 * exposing this to untrusted/public traffic at scale.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = RequestPasswordResetBody.parse(await req.json());
  const email = normalizeEmail(body.email);

  const limit = rateLimit(`password-reset:${clientIp(req.headers)}:${email}`, 5, 60_000);
  if (!limit.ok) {
    return error(429, "Too many reset attempts. Try again in a minute.");
  }

  const users = await usersCollection();
  const candidates = await users.find({ email, passwordHash: { $ne: null } }).toArray();

  if (candidates.length !== 1) {
    return json({ ok: true, code: null });
  }

  const user = candidates[0]!;
  const code = generateResetCode();
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetCodeHash: hashPassword(code),
        passwordResetExpiresAt: new Date(Date.now() + CODE_VALID_MS),
        updatedAt: new Date(),
      },
    },
  );

  return json({ ok: true, code });
});
