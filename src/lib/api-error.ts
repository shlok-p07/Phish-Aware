/**
 * Narrow accessors for the two things the UI ever needs off a failed request.
 *
 * These read structurally rather than via `instanceof ApiError`. That keeps them
 * working for anything error-shaped -- the real ApiError, a plain object from a
 * test mock, an error surfaced through a second copy of the client module -- and
 * matches the `(err as any)?.status` reads these replaced.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** HTTP status of a failed request, or undefined if it carries none. */
export function errorStatus(err: unknown): number | undefined {
  const status = asRecord(err)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * The server's machine-readable error tag.
 *
 * Checks the response body first -- that's where our API routes put it (see
 * HttpError in src/server) -- then the error object itself. Call sites that
 * reached for `err.code` alone were always reading undefined.
 */
export function errorCode(err: unknown): string | undefined {
  const record = asRecord(err);
  if (!record) return undefined;

  const fromBody = asRecord(record.data)?.code;
  if (typeof fromBody === "string") return fromBody;

  return typeof record.code === "string" ? record.code : undefined;
}
