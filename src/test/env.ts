/**
 * Save and restore a `process.env` key across a test.
 *
 * `process.env.FOO = undefined` does not unset FOO -- the env object coerces
 * every assignment to a string, so the key survives holding the literal text
 * "undefined", which is truthy and non-blank. A test that captured an unset
 * variable and "restored" it that way therefore leaves a live value behind for
 * every file that runs after it in the same process.
 *
 * That is not hypothetical: codeDelivery.test.ts restored an unset
 * PASSWORD_RESET_WEBHOOK_URL this way, so `resetCodeWebhookConfigured()` read
 * "undefined" as a configured webhook and two password-reset tests failed --
 * only in the full run, and in a file that never mentions webhooks.
 */
const env = process.env as Record<string, string | undefined>;

/** The current value, for handing back to {@link restoreEnv} later. */
export function captureEnv(key: string): string | undefined {
  return env[key];
}

/** Restore a captured value, genuinely unsetting the key when it was unset. */
export function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete env[key];
  } else {
    env[key] = value;
  }
}

/** Set a key, or unset it when passed undefined. Mirrors {@link restoreEnv}. */
export function setEnv(key: string, value: string | undefined): void {
  restoreEnv(key, value);
}
