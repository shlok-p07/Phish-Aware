/**
 * Machine-readable `code` values the auth routes put on their 4xx bodies,
 * alongside the human-readable `error` string.
 *
 * Kept in lib/ rather than next to the server logic so the client can key its
 * UI off the code without importing a server module: the sign-in page needs to
 * tell "wrong password" (just re-try) apart from "locked out" (the only way
 * forward is a password reset), and matching on message text would break the
 * moment the copy is edited.
 */
export const ACCOUNT_LOCKED_CODE = "ACCOUNT_LOCKED";
export const PASSWORD_RESET_REQUIRED_CODE = "PASSWORD_RESET_REQUIRED";

/** True for the two states a password reset is the only way out of. */
export function isLockoutCode(code: string | null): boolean {
  return code === ACCOUNT_LOCKED_CODE || code === PASSWORD_RESET_REQUIRED_CODE;
}

function bodyField(err: unknown, key: string): string | null {
  const data = (err as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** The `code` off an ApiError body, or null for anything else. */
export function authErrorCode(err: unknown): string | null {
  return bodyField(err, "code");
}

/**
 * The server's own `error` string, without the `HTTP 423 Locked: ` prefix
 * ApiError builds into `message` for logging.
 */
export function authErrorMessage(err: unknown, fallback: string): string {
  return bodyField(err, "error") ?? fallback;
}
