import { beforeEach, describe, expect, it } from "bun:test";
import {
  acquire,
  availableTokens,
  bucketKey,
  canAfford,
  debit,
  estimateTokens,
  INTERACTIVE_RESERVE,
  isBackingOff,
  isModelGone,
  MAX_BACKOFF_MS,
  noteBackoff,
  reconcile,
  release,
  resetRateLimiter,
  retryAfterMs,
  snapshot,
  waitFor,
  DEFAULT_TOKEN_LIMIT,
} from "./rateLimiter";

const KEY = bucketKey("groq", "openai/gpt-oss-120b");
const OTHER = bucketKey("groq", "openai/gpt-oss-20b");
const T0 = 1_800_000_000_000;

/** A clock the test drives, so nothing depends on real elapsed time. */
function clock(start = T0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/** Records sleeps instead of performing them, and advances the fake clock. */
function recorder(c: ReturnType<typeof clock>) {
  const slept: number[] = [];
  return {
    slept,
    wait: async (ms: number) => {
      slept.push(ms);
      c.advance(ms);
    },
  };
}

describe("estimateTokens", () => {
  it("prices the prompt and the reserved completion together", () => {
    // Four characters per token, plus the full completion reservation rather
    // than a guess: assuming a short reply and getting a long one is the
    // overshoot this exists to prevent.
    expect(estimateTokens(400, 1_000)).toBe(1_100);
  });

  it("rounds a partial token up", () => {
    expect(estimateTokens(5, 0)).toBe(2);
  });
});

describe("availableTokens", () => {
  beforeEach(resetRateLimiter);

  it("treats a bucket nobody has observed as full", () => {
    expect(availableTokens(KEY, T0)).toBe(DEFAULT_TOKEN_LIMIT);
  });

  it("refills continuously rather than on a window boundary", () => {
    // Groq's reset header reads in hundreds of milliseconds for a nearly-full
    // bucket, which is a leaky bucket, not a window that flips.
    reconcile(KEY, { remainingTokens: 0, limitTokens: 8_000 }, T0);
    expect(availableTokens(KEY, T0)).toBe(0);
    expect(availableTokens(KEY, T0 + 30_000)).toBeCloseTo(4_000, 0);
    expect(availableTokens(KEY, T0 + 60_000)).toBe(8_000);
  });

  it("never reports more than the limit", () => {
    reconcile(KEY, { remainingTokens: 7_000, limitTokens: 8_000 }, T0);
    expect(availableTokens(KEY, T0 + 600_000)).toBe(8_000);
  });
});

describe("per-model buckets", () => {
  beforeEach(resetRateLimiter);

  it("keeps one model's spend off another's budget", () => {
    // The measured fact the lane split is built on: draining gpt-oss-120b left
    // gpt-oss-20b at a full bucket.
    reconcile(KEY, { remainingTokens: 500, limitTokens: 8_000 }, T0);
    expect(availableTokens(KEY, T0)).toBe(500);
    expect(availableTokens(OTHER, T0)).toBe(DEFAULT_TOKEN_LIMIT);
  });
});

describe("reconcile", () => {
  beforeEach(resetRateLimiter);

  it("replaces the estimate with the provider's own figure", () => {
    debit(KEY, 3_000, T0);
    expect(availableTokens(KEY, T0)).toBe(5_000);
    reconcile(KEY, { remainingTokens: 1_234, limitTokens: 8_000 }, T0);
    expect(availableTokens(KEY, T0)).toBe(1_234);
  });

  it("ignores absent or unparseable headers rather than defaulting them", () => {
    // A provider that reports nothing should keep the estimated accounting, not
    // be handed a fabricated budget.
    debit(KEY, 3_000, T0);
    reconcile(KEY, { remainingTokens: null, limitTokens: null }, T0);
    expect(availableTokens(KEY, T0)).toBe(5_000);
    reconcile(KEY, { remainingTokens: Number.NaN }, T0);
    expect(availableTokens(KEY, T0)).toBe(5_000);
  });

  it("learns a limit that differs from the assumed default", () => {
    reconcile(KEY, { remainingTokens: 100, limitTokens: 30_000 }, T0);
    expect(snapshot(T0)[KEY]!.limit).toBe(30_000);
  });
});

describe("the interactive reserve", () => {
  beforeEach(resetRateLimiter);

  it("stops background work spending the last of the budget", () => {
    // Otherwise pool top-up drains the bucket and the next trainee message
    // waits a full refill window for a reply.
    reconcile(KEY, { remainingTokens: 2_000, limitTokens: 8_000 }, T0);
    const reserve = 8_000 * INTERACTIVE_RESERVE;
    expect(canAfford(KEY, 2_000 - reserve + 1, "background", T0)).toBe(false);
    expect(canAfford(KEY, 2_000, "interactive", T0)).toBe(true);
  });

  it("lets background work use the budget above the reserve", () => {
    reconcile(KEY, { remainingTokens: 8_000, limitTokens: 8_000 }, T0);
    expect(canAfford(KEY, 5_000, "background", T0)).toBe(true);
  });

  it("quotes a longer wait to background than to interactive", () => {
    reconcile(KEY, { remainingTokens: 0, limitTokens: 8_000 }, T0);
    expect(waitFor(KEY, 1_000, "background", T0)).toBeGreaterThan(
      waitFor(KEY, 1_000, "interactive", T0),
    );
  });

  it("quotes no wait when the budget is already there", () => {
    expect(waitFor(KEY, 100, "interactive", T0)).toBe(0);
  });
});

describe("acquire", () => {
  beforeEach(resetRateLimiter);

  it("admits a call that fits and debits it", async () => {
    const c = clock();
    const result = await acquire(KEY, 1_000, "interactive", { now: c.now, wait: recorder(c).wait });
    expect(result.ok).toBe(true);
    expect(availableTokens(KEY, c.now())).toBe(7_000);
    release(KEY);
  });

  it("serialises calls on one bucket", async () => {
    // A bucket this small cannot support parallelism: two concurrent calls each
    // sized for it would overrun together.
    const c = clock();
    const first = await acquire(KEY, 1_000, "interactive", { now: c.now, wait: recorder(c).wait });
    expect(first.ok).toBe(true);

    const rec = recorder(c);
    const second = await acquire(KEY, 1_000, "interactive", { now: c.now, wait: rec.wait });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("busy");

    release(KEY);
    const third = await acquire(KEY, 1_000, "interactive", { now: c.now, wait: recorder(c).wait });
    expect(third.ok).toBe(true);
  });

  it("runs different buckets at the same time", async () => {
    // This is where the throughput comes from: the two generation stages hold
    // slots on different models simultaneously.
    const c = clock();
    const a = await acquire(KEY, 1_000, "background", { now: c.now, wait: recorder(c).wait });
    const b = await acquire(OTHER, 1_000, "background", { now: c.now, wait: recorder(c).wait });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("waits for budget rather than overrunning the limit", async () => {
    const c = clock();
    reconcile(KEY, { remainingTokens: 0, limitTokens: 8_000 }, c.now());
    const rec = recorder(c);
    const result = await acquire(KEY, 1_000, "background", { now: c.now, wait: rec.wait });
    expect(result.ok).toBe(true);
    // It slept instead of sending immediately.
    expect(rec.slept.length).toBeGreaterThan(0);
  });

  it("gives up quickly for an interactive caller so the request can fall back", async () => {
    const c = clock();
    reconcile(KEY, { remainingTokens: 0, limitTokens: 8_000 }, c.now());
    const rec = recorder(c);
    const result = await acquire(KEY, 8_000, "interactive", { now: c.now, wait: rec.wait });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("budget");
    // Bounded: a trainee is watching, and stored content beats a spinner.
    expect(c.now() - T0).toBeLessThanOrEqual(7_000);
  });

  it("refuses immediately when a backoff outlasts the caller's patience", async () => {
    const c = clock();
    noteBackoff(KEY, 300_000, "rate limited", c.now(), () => 0);
    const rec = recorder(c);
    const result = await acquire(KEY, 100, "interactive", { now: c.now, wait: rec.wait });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("backoff");
    // No point queueing behind a five-minute pause.
    expect(rec.slept).toEqual([]);
  });
});

describe("noteBackoff", () => {
  beforeEach(resetRateLimiter);

  it("pauses the bucket", () => {
    noteBackoff(KEY, 30_000, "rate limited", T0, () => 0);
    expect(isBackingOff(KEY, T0)).toBe(true);
    expect(isBackingOff(KEY, T0 + 30_001)).toBe(false);
  });

  it("adds jitter so queued callers do not all resume together", () => {
    noteBackoff(KEY, 10_000, "rate limited", T0, () => 1);
    // Jitter is additive and bounded at a tenth.
    expect(snapshot(T0)[KEY]!.backoffMs).toBeGreaterThan(10_000);
    expect(snapshot(T0)[KEY]!.backoffMs).toBeLessThanOrEqual(11_000);
  });

  it("clamps an absurd value so one bad header cannot disable a bucket for a day", () => {
    noteBackoff(KEY, 999_999_999, "rate limited", T0, () => 0);
    expect(snapshot(T0)[KEY]!.backoffMs).toBeLessThanOrEqual(MAX_BACKOFF_MS);
  });

  it("never shortens a longer pause already in place", () => {
    noteBackoff(KEY, 300_000, "long", T0, () => 0);
    noteBackoff(KEY, 1_000, "short", T0, () => 0);
    expect(snapshot(T0)[KEY]!.backoffMs).toBe(300_000);
  });

  it("does not touch a different bucket", () => {
    noteBackoff(KEY, 60_000, "rate limited", T0, () => 0);
    expect(isBackingOff(OTHER, T0)).toBe(false);
  });
});

describe("retryAfterMs", () => {
  it("reads a Retry-After from a Headers instance", () => {
    const err = Object.assign(new Error("429"), {
      status: 429,
      headers: new Headers({ "retry-after": "12" }),
    });
    expect(retryAfterMs(err)).toBe(12_000);
  });

  it("reads one from a plain object", () => {
    expect(retryAfterMs({ status: 429, headers: { "retry-after": "5" } })).toBe(5_000);
  });

  it("still pauses on a 429 with no usable header", () => {
    expect(retryAfterMs({ status: 429, headers: {} })).toBeGreaterThan(0);
    // Retry-After is spec-legal as an HTTP-date, which is not a duration.
    expect(
      retryAfterMs({ status: 429, headers: { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" } }),
    ).toBeGreaterThan(0);
  });

  it("clamps an absurd value", () => {
    expect(retryAfterMs({ status: 429, headers: { "retry-after": "999999999" } })).toBe(
      MAX_BACKOFF_MS,
    );
  });

  it("returns nothing for anything that is not a 429", () => {
    expect(retryAfterMs({ status: 500 })).toBeNull();
    expect(retryAfterMs(new Error("network"))).toBeNull();
  });
});

describe("isModelGone", () => {
  it("recognises a decommissioned model", () => {
    // The failure that made this whole module necessary: the configured model
    // was retired, every call 404'd, and because a 404 is not a 429 nothing
    // backed off -- so each request paid a wasted round trip and all traffic
    // silently fell through to the fallback provider.
    expect(
      isModelGone(
        Object.assign(new Error("404 The model `llama-3.3-70b-versatile` does not exist"), {
          status: 404,
        }),
      ),
    ).toBe(true);
    expect(
      isModelGone(Object.assign(new Error("model_not_found"), { status: 404 })),
    ).toBe(true);
  });

  it("does not mistake an ordinary 404 or a rate limit for it", () => {
    expect(isModelGone(Object.assign(new Error("404 not found"), { status: 404 }))).toBe(false);
    expect(isModelGone(Object.assign(new Error("429 rate limit"), { status: 429 }))).toBe(false);
  });
});
