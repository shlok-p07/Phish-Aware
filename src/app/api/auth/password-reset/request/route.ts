import { NextRequest } from "next/server";
import { usersCollection } from "@/db";
import { RequestPasswordResetBody } from "@/api-zod";
import { hashPassword, generateResetCode } from "@/server/password";
import { normalizeEmail } from "@/server/sso/domain";
import { rateLimit, clientIp } from "@/server/rateLimit";
import { json, error, withErrorHandling, readJsonBody } from "@/server/http";
import { deliverResetCode, resetCodeWebhookConfigured } from "@/server/codeDelivery";

export const dynamic = "force-dynamic";

const CODE_VALID_MS = 15 * 60 * 1000;

/**
 * There is no mail delivery in this app, so outside production the code is
 * returned directly and shown in the UI.
 *
 * In production it never is. Handing the code back over HTTP means anyone who
 * knows an employee's address can take over the account without ever touching
 * their mailbox -- an unauthenticated takeover primitive, which is not something
 * a security-awareness product can ship. Returning a code for a real account and
 * null for an unknown one also confirms which addresses have accounts, so in
 * production the response is identical either way and nothing is written: the
 * working path there is an admin-issued code (POST
 * /api/org/members/[id]/reset-code), redeemed through the same confirm route.
 */
function disclosesCodeInResponse(): boolean {
  // Read per request rather than captured at module load, so a test can cover
  // the production path without mutating a process-global before other test
  // files import this one.
  return process.env.NODE_ENV !== "production";
}
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = RequestPasswordResetBody.parse(await readJsonBody(req));
  const email = normalizeEmail(body.email);

  const limit = rateLimit(`password-reset:${clientIp(req.headers)}:${email}`, 5, 60_000);
  if (!limit.ok) {
    return error(429, "Too many reset attempts. Try again in a minute.");
  }

  // In production the code is never returned. If an out-of-band channel is
  // configured it goes there instead; otherwise nothing is written at all, since
  // issuing a code nobody can obtain would also let anyone overwrite a pending
  // admin-issued one and deny the only path that works.
  if (!disclosesCodeInResponse() && !resetCodeWebhookConfigured()) {
    // Identical for a real account and an unknown one.
    return json({ ok: true, code: null, delivery: "administrator" as const });
  }

  const users = await usersCollection();
  const candidates = await users.find({ email, passwordHash: { $ne: null } }).toArray();

  if (candidates.length !== 1) {
    return json({ ok: true, code: null, delivery: "shown" as const });
  }

  const user = candidates[0]!;
  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + CODE_VALID_MS);
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetCodeHash: hashPassword(code),
        passwordResetExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
    },
  );

  if (!disclosesCodeInResponse()) {
    // Configured channel, production. Delivered out of band or not at all --
    // never in this response.
    const delivered = await deliverResetCode({ email, code, expiresAt });
    return json({
      ok: true,
      code: null,
      delivery: delivered ? ("out_of_band" as const) : ("administrator" as const),
    });
  }

  return json({ ok: true, code, delivery: "shown" as const });
});
