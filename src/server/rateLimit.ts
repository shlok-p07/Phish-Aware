/**
 * Best-effort in-process rate limiting.
 *
 * Deliberately not backed by Mongo: at this scale a collection plus a TTL index
 * for login throttling is more machinery than the problem warrants. The
 * tradeoff is that counters are per-instance, so with N app instances the
 * effective limit is N x the configured one. That is fine for slowing down
 * scripted probing and is not a defense against a distributed attacker.
 *
 * Cached on globalThis for the same reason src/db/client.ts does it: dev hot
 * reload would otherwise reset every counter on each edit.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as {
  _rateLimitBuckets?: Map<string, Bucket>;
};

const buckets = (globalForRateLimit._rateLimitBuckets ??= new Map<string, Bucket>());

/** Bounded so a flood of distinct keys can't grow the map without limit. */
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. Only meaningful when ok is false. */
  retryAfter: number;
}

/** Fixed-window counter. Returns ok:false once `limit` is exceeded within `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) {
          buckets.delete(k);
        }
      }
      // Still full of live windows -- drop the whole map rather than leak.
      if (buckets.size >= MAX_KEYS) {
        buckets.clear();
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Best-effort client IP. x-forwarded-for's first hop is the client when the app
 * sits behind exactly one trusted proxy, which is how it's deployed. The header
 * is spoofable if traffic can reach the app directly -- another reason this is
 * throttling rather than access control.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Reset every counter. Test-only. */
export function __resetRateLimits(): void {
  buckets.clear();
}
