/**
 * Admission control for LLM calls, budgeted in tokens rather than requests.
 *
 * Measured against the live Groq account rather than assumed:
 *
 *   x-ratelimit-limit-requests: 1000   (per day)
 *   x-ratelimit-limit-tokens:   8000   (per minute, sub-second refill)
 *
 * So requests are not the constraint -- tokens are. One two-stage scenario
 * generation costs roughly 2,000-4,000 tokens, which means the real ceiling is
 * about two scenarios per minute per model. Counting requests would have said we
 * were using 4 of 1000 and left us wondering why everything 429s.
 *
 * The second measured fact shapes the whole design: token buckets are **per
 * model**, not per account. Draining openai/gpt-oss-120b to 5,010 left
 * openai/gpt-oss-20b sitting at a full bucket. Splitting the pipeline's stages
 * across different models therefore multiplies the available budget instead of
 * dividing it, and keeps the chatbot's latency independent of generation load.
 *
 * What was wrong before: the only defence was reacting to a 429 after the fact.
 * Every rate-limit event cost a wasted round trip, and a single 429 blacked out
 * an entire provider for the whole Retry-After -- including small calls that
 * would have fit. Meanwhile up to six background pool top-ups could fire at
 * once, each a two-stage generation, wanting 3-4x the minute's budget in one
 * burst. Bursts, not steady load, are what broke it.
 *
 * This module fixes that by knowing the budget before spending it:
 *
 *  - estimate a call's cost, and wait rather than send when it will not fit
 *  - reconcile against the authoritative remaining-tokens header after each call
 *  - one call in flight per bucket, because a bucket this small cannot support
 *    parallelism -- but different buckets run concurrently, which is where the
 *    throughput comes from
 *  - interactive work skips the queue and keeps a reserved slice of budget, so a
 *    trainee waiting on a chat reply is never stuck behind pool top-ups
 */

/** Who is waiting, which decides who yields. */
export type Priority = "interactive" | "background";

/**
 * Independent token buckets. Each lane pins one model, so the stages of a
 * generation do not compete with each other or with the chatbot.
 *
 * Assignments are by difficulty, not by cost: `refine` produces the strict JSON
 * and the honest cue severities, which is the stage that actually has to be
 * right, so it gets the strongest model. Drafting prose is easy.
 */
export type Lane = "draft" | "refine" | "chat";

export interface BucketState {
  /** Tokens believed available right now. */
  remaining: number;
  /** The bucket's ceiling, learned from response headers. */
  limit: number;
  /** When the bucket was last reconciled with a real response. */
  observedAt: number;
  /** Set while a call is in flight, since one bucket serves one call at a time. */
  busy: boolean;
  /** Epoch ms before which this bucket must not be used at all. */
  backoffUntil: number;
  /**
   * Actual tokens spent and calls made, from the usage each response reports.
   *
   * Kept because the remaining-tokens header is a rolling account figure -- it
   * reflects everything that hit the account in the last minute, so it cannot
   * tell you what one call cost. Tuning the per-lane completion caps needs the
   * real per-call figure, and guessing at it is how a cap ends up either
   * throttling good output or failing to bound a runaway one.
   */
  actualTokens: number;
  calls: number;
  /** Why it is backing off, for logging that says something useful. */
  backoffReason: string | null;
}

/**
 * Assumed ceiling before the first response teaches us the real one.
 *
 * Matches what Groq reports today. Being wrong here is self-correcting: the
 * first successful call replaces it with the authoritative figure.
 */
export const DEFAULT_TOKEN_LIMIT = 8_000;

/**
 * How fast the bucket refills, as a fraction of the limit per millisecond.
 *
 * Groq's reset header reads in the hundreds of milliseconds for a nearly-full
 * bucket, which is a leaky bucket refilling continuously rather than a window
 * that resets on a boundary. Modelling it as continuous refill means a caller
 * that waits 30 seconds correctly believes it has about half the budget back,
 * instead of either nothing or everything.
 */
const REFILL_WINDOW_MS = 60_000;

/**
 * Budget fraction background work will not touch.
 *
 * Without this, pool top-up drains the bucket to zero and the next trainee
 * message waits a full refill window for a reply. Background work is by
 * definition not urgent; it can wait for the headroom instead.
 */
export const INTERACTIVE_RESERVE = 0.25;

/** Longest a background caller will wait for budget before giving up. */
const BACKGROUND_MAX_WAIT_MS = 45_000;
/**
 * Longest an interactive caller will wait. Short: a trainee is watching, and a
 * fast fall back to the static pool beats a spinner.
 */
const INTERACTIVE_MAX_WAIT_MS = 6_000;

/** How long to sit out after a 429 with no usable Retry-After. */
const DEFAULT_BACKOFF_MS = 30_000;
/** Cap, so a malformed Retry-After cannot disable a bucket for a day. */
export const MAX_BACKOFF_MS = 10 * 60 * 1000;
/**
 * A decommissioned model is not a transient failure -- retrying it every request
 * is pure waste -- but nor should it be permanent, since a deploy may fix it.
 */
export const MODEL_GONE_BACKOFF_MS = 15 * 60 * 1000;

const buckets = new Map<string, BucketState>();

function freshBucket(): BucketState {
  return {
    remaining: DEFAULT_TOKEN_LIMIT,
    limit: DEFAULT_TOKEN_LIMIT,
    observedAt: 0,
    busy: false,
    backoffUntil: 0,
    backoffReason: null,
    actualTokens: 0,
    calls: 0,
  };
}

export function bucketKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

function stateFor(key: string): BucketState {
  const existing = buckets.get(key);
  if (existing) return existing;
  const created = freshBucket();
  buckets.set(key, created);
  return created;
}

/**
 * Tokens available now, accounting for refill since the last observation.
 *
 * Never exceeds the limit, and treats a never-observed bucket as full.
 */
export function availableTokens(key: string, now: number): number {
  const state = stateFor(key);
  if (state.observedAt === 0) return state.limit;
  const elapsed = Math.max(0, now - state.observedAt);
  const refilled = (elapsed / REFILL_WINDOW_MS) * state.limit;
  return Math.min(state.limit, state.remaining + refilled);
}

/**
 * A call's token cost, before making it.
 *
 * Four characters per token is the usual English approximation and is close
 * enough: this decides whether to wait a moment, and the authoritative number
 * arrives in the response headers straight afterwards. Completion tokens are
 * counted at their reserved maximum rather than a guess, because the whole point
 * is to not overrun -- assuming a short reply and getting a long one is exactly
 * the overshoot to avoid.
 */
export function estimateTokens(promptChars: number, maxCompletionTokens: number): number {
  return Math.ceil(promptChars / 4) + maxCompletionTokens;
}

/** Whether a bucket is currently sitting out, clearing the flag once it expires. */
export function isBackingOff(key: string, now: number): boolean {
  const state = stateFor(key);
  if (state.backoffUntil === 0) return false;
  if (now >= state.backoffUntil) {
    state.backoffUntil = 0;
    state.backoffReason = null;
    return false;
  }
  return true;
}

/**
 * Records that a bucket must not be used for a while.
 *
 * Jittered, because every instance and every queued caller would otherwise
 * resume on the same millisecond and re-trip the limit together. A tenth of the
 * delay is enough to spread them without materially changing the wait.
 */
export function noteBackoff(
  key: string,
  ms: number,
  reason: string,
  now: number = Date.now(),
  random: () => number = Math.random,
): void {
  const state = stateFor(key);
  const capped = Math.min(Math.max(ms, 1_000), MAX_BACKOFF_MS);
  const jittered = capped + Math.floor(random() * capped * 0.1);
  const until = now + jittered;
  // Never shorten an existing, longer pause.
  if (until <= state.backoffUntil) return;
  state.backoffUntil = until;
  state.backoffReason = reason;
  console.warn(`[llm] ${key} paused ${Math.round(jittered / 1000)}s: ${reason}`);
}

/**
 * Replaces belief with fact.
 *
 * Called after every response that carried rate-limit headers. Anything absent
 * or unparseable is left alone rather than defaulted, so a provider that reports
 * nothing simply keeps the estimated accounting.
 */
export function reconcile(
  key: string,
  headers: { remainingTokens?: number | null; limitTokens?: number | null },
  now: number = Date.now(),
): void {
  const state = stateFor(key);
  if (typeof headers.limitTokens === "number" && Number.isFinite(headers.limitTokens) && headers.limitTokens > 0) {
    state.limit = headers.limitTokens;
  }
  if (typeof headers.remainingTokens === "number" && Number.isFinite(headers.remainingTokens)) {
    state.remaining = Math.max(0, headers.remainingTokens);
    state.observedAt = now;
  }
}

/** Records what a call actually cost, from the provider's own usage figures. */
export function recordUsage(key: string, totalTokens: number | null | undefined): void {
  if (typeof totalTokens !== "number" || !Number.isFinite(totalTokens) || totalTokens <= 0) return;
  const state = stateFor(key);
  state.actualTokens += totalTokens;
  state.calls += 1;
}

/** Debits the estimate locally, for the window before headers arrive. */
export function debit(key: string, tokens: number, now: number = Date.now()): void {
  const state = stateFor(key);
  state.remaining = Math.max(0, availableTokens(key, now) - tokens);
  state.observedAt = now;
}

/**
 * Whether a call of this size may proceed right now.
 *
 * Background callers are held to a reserve so they cannot spend the budget an
 * interactive caller is about to need.
 */
export function canAfford(key: string, tokens: number, priority: Priority, now: number): boolean {
  const state = stateFor(key);
  const available = availableTokens(key, now);
  const floor = priority === "background" ? state.limit * INTERACTIVE_RESERVE : 0;
  return available - tokens >= floor;
}

/** Milliseconds until a call of this size could afford to run. */
export function waitFor(key: string, tokens: number, priority: Priority, now: number): number {
  const state = stateFor(key);
  const available = availableTokens(key, now);
  const floor = priority === "background" ? state.limit * INTERACTIVE_RESERVE : 0;
  const shortfall = tokens + floor - available;
  if (shortfall <= 0) return 0;
  // Continuous refill, so the wait is proportional to the shortfall.
  return Math.ceil((shortfall / state.limit) * REFILL_WINDOW_MS);
}

export interface AcquireResult {
  ok: boolean;
  /** Why admission was refused, for the caller's log line. */
  reason?: "backoff" | "budget" | "busy";
  /** What the estimate charged, so the caller can reconcile afterwards. */
  estimated: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for a turn on this bucket, or gives up.
 *
 * The wait is bounded by priority: an interactive caller gives up quickly so the
 * request can fall back to stored content, while background work is happy to sit
 * out a refill window. Returns without a slot rather than throwing, because
 * every caller already has a non-LLM fallback and none of them should treat
 * "busy" as an error.
 */
export async function acquire(
  key: string,
  estimated: number,
  priority: Priority,
  options: { now?: () => number; wait?: (ms: number) => Promise<void> } = {},
): Promise<AcquireResult> {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? sleep;
  const deadline = now() + (priority === "interactive" ? INTERACTIVE_MAX_WAIT_MS : BACKGROUND_MAX_WAIT_MS);

  for (;;) {
    const at = now();
    const state = stateFor(key);

    if (isBackingOff(key, at)) {
      // No point queueing behind a pause that outlasts our patience.
      if (state.backoffUntil > deadline) return { ok: false, reason: "backoff", estimated };
      await wait(Math.min(state.backoffUntil - at, 1_000));
      continue;
    }

    if (!state.busy && canAfford(key, estimated, priority, at)) {
      state.busy = true;
      debit(key, estimated, at);
      return { ok: true, estimated };
    }

    if (at >= deadline) {
      return { ok: false, reason: state.busy ? "busy" : "budget", estimated };
    }

    // Poll rather than maintain a wakeup queue: contention here is a handful of
    // callers, and a queue would need its own fairness and cancellation rules.
    const needed = state.busy ? 250 : Math.max(250, waitFor(key, estimated, priority, at));
    await wait(Math.min(needed, deadline - at, 2_000));
  }
}

/** Frees the bucket. Must run whether the call succeeded or threw. */
export function release(key: string): void {
  stateFor(key).busy = false;
}

/** Reads a Retry-After, in ms, from whatever shape the provider used. */
export function retryAfterMs(err: unknown): number | null {
  const status = (err as { status?: number })?.status;
  if (status !== 429) return null;
  const headers = (err as { headers?: unknown })?.headers;
  let raw: string | null = null;
  if (headers && typeof (headers as Headers).get === "function") {
    raw = (headers as Headers).get("retry-after");
  } else if (headers && typeof headers === "object") {
    const value = (headers as Record<string, unknown>)["retry-after"];
    raw = typeof value === "string" ? value : null;
  }
  const seconds = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_BACKOFF_MS;
  return Math.min(seconds * 1000, MAX_BACKOFF_MS);
}

/**
 * Whether the model itself is gone.
 *
 * Worth its own case: llama-3.3-70b-versatile was decommissioned under us and
 * every call began returning 404 model_not_found. Because that is not a 429,
 * nothing backed off, so each request paid a full wasted round trip to Groq
 * before falling through -- and every scenario in the product was being
 * generated by the fallback provider alone, which then exhausted its own quota.
 * A dual-provider design had quietly become single-provider.
 */
export function isModelGone(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status !== 404) return false;
  const message = err instanceof Error ? err.message : String(err);
  return /model_not_found|does not exist|do not have access/i.test(message);
}

/** Test seam: bucket state is process-global and would leak between cases. */
export function resetRateLimiter(): void {
  buckets.clear();
}

/** Inspection for tests and diagnostics. */
export interface BucketSnapshot {
  available: number;
  limit: number;
  busy: boolean;
  backoffMs: number;
  reason: string | null;
  /** Tokens actually billed across this bucket's calls, per the provider. */
  actualTokens: number;
  calls: number;
  /** Mean real cost of a call here, which is what the caps are tuned against. */
  meanTokensPerCall: number;
}

export function snapshot(now: number = Date.now()): Record<string, BucketSnapshot> {
  const out: Record<string, BucketSnapshot> = {};
  for (const [key, state] of buckets) {
    out[key] = {
      available: Math.round(availableTokens(key, now)),
      limit: state.limit,
      busy: state.busy,
      backoffMs: Math.max(0, state.backoffUntil - now),
      reason: state.backoffReason,
      actualTokens: state.actualTokens,
      calls: state.calls,
      meanTokensPerCall: state.calls === 0 ? 0 : Math.round(state.actualTokens / state.calls),
    };
  }
  return out;
}
