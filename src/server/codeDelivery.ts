/**
 * Optional out-of-band delivery for a password reset code.
 *
 * The app has no mailer, and in production the code is deliberately not returned
 * to the caller: handing it to an unauthenticated request is an account takeover
 * for anyone who knows an address. That left an admin-issued code as the only
 * production path, which works but needs a human in the loop.
 *
 * This is the seam that removes the human without choosing a provider. Set
 * PASSWORD_RESET_WEBHOOK_URL and the code is POSTed there instead of returned,
 * for whatever the operator already runs -- a mail service, a ticketing system,
 * an internal notifier. Unset, which is the default, nothing changes and the
 * admin path stands. No new dependency, and no provider baked into the product.
 *
 * The code still never reaches the HTTP response either way.
 */
export interface ResetCodeDelivery {
  email: string;
  code: string;
  expiresAt: Date;
}

export function resetCodeWebhookConfigured(): boolean {
  return Boolean(process.env.PASSWORD_RESET_WEBHOOK_URL?.trim());
}

/**
 * Returns true only if the code was accepted by the endpoint. A failure is
 * reported rather than thrown so the caller can fall back to telling the user to
 * ask an admin, instead of failing the whole request over a delivery hiccup.
 */
export async function deliverResetCode(delivery: ResetCodeDelivery): Promise<boolean> {
  const url = process.env.PASSWORD_RESET_WEBHOOK_URL?.trim();
  if (!url) {
    return false;
  }
  const secret = process.env.PASSWORD_RESET_WEBHOOK_SECRET?.trim();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // A shared secret so the receiving endpoint can reject anything that did
        // not come from this app. Optional, because an endpoint on a private
        // network may not need one.
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        type: "password_reset_code",
        email: delivery.email,
        code: delivery.code,
        expiresAt: delivery.expiresAt.toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // Deliberately no code, no email, and no response body in the log: this
      // line exists on the path where a reset code is in flight.
      console.warn(`[reset-delivery] webhook rejected the request (${res.status})`);
      return false;
    }
    return true;
  } catch (cause) {
    console.warn("[reset-delivery] webhook unreachable", cause);
    return false;
  }
}
