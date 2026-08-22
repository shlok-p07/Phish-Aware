import { describe, expect, it, beforeEach } from "bun:test";
import type { CompleteOptions } from "./llmComplete";
import {
  installLlmProviderMocks,
  llmMockState,
  resetLlmMockState,
  groqReturning,
  groqThrowing,
  geminiReturning,
  geminiThrowing,
} from "./test-provider-mock";

installLlmProviderMocks();

const { complete } = await import("./llmComplete");
const { resetRateLimiter } = await import("./rateLimiter");

/** Mimics the shape the Groq/Gemini SDKs throw on a 429. */
function rateLimitError(retryAfter: string | null) {
  const err = new Error("429 rate_limit_exceeded") as Error & {
    status: number;
    headers: Headers;
  };
  err.status = 429;
  err.headers = new Headers(retryAfter === null ? {} : { "retry-after": retryAfter });
  return err;
}

/**
 * A Groq fake in the shape the SDK actually returns: create() is synchronous and
 * yields an object with withResponse(). The previous inline fakes were
 * `async () => { throw ... }`, so withResponse() did not exist on the rejected
 * promise and the thrown 429 never reached the backoff logic at all.
 */
function groqFailing(counter: { calls: number }, makeError: () => unknown) {
  return {
    chat: {
      completions: {
        create: () => {
          counter.calls += 1;
          return {
            withResponse: async () => {
              throw makeError();
            },
          };
        },
      },
    },
  };
}

const OPTIONS: CompleteOptions = {
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello" }],
  temperature: 0.5,
};

describe("complete (Groq -> Gemini fallback)", () => {
  beforeEach(() => {
    resetLlmMockState();
    resetRateLimiter();
  });

  it("returns Groq's result and never calls Gemini when Groq succeeds", async () => {
    let geminiCalled = false;
    llmMockState.groqClient = groqReturning("Hi from Groq");
    llmMockState.geminiClient = geminiReturning("Hi from Gemini", () => {
      geminiCalled = true;
    });

    const result = await complete(OPTIONS);
    expect(result).toBe("Hi from Groq");
    expect(geminiCalled).toBe(false);
  });

  it("falls back to Gemini when Groq is unconfigured", async () => {
    llmMockState.groqClient = null;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    const result = await complete(OPTIONS);
    expect(result).toBe("Hi from Gemini");
  });

  it("falls back to Gemini when Groq throws", async () => {
    llmMockState.groqClient = groqThrowing("rate limited");
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    const result = await complete(OPTIONS);
    expect(result).toBe("Hi from Gemini");
  });

  it("falls back to Gemini when Groq returns empty content", async () => {
    llmMockState.groqClient = groqReturning(null);
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    const result = await complete(OPTIONS);
    expect(result).toBe("Hi from Gemini");
  });

  it("returns null (not a throw) when both providers are unconfigured", async () => {
    llmMockState.groqClient = null;
    llmMockState.geminiClient = null;

    const result = await complete(OPTIONS);
    expect(result).toBeNull();
  });

  it("returns null (not a throw) when both providers fail", async () => {
    llmMockState.groqClient = groqThrowing("groq down");
    llmMockState.geminiClient = geminiThrowing("gemini down");

    const result = await complete(OPTIONS);
    expect(result).toBeNull();
  });

  it("requests JSON mode from Groq when json: true", async () => {
    let seenArgs: unknown;
    llmMockState.groqClient = groqReturning('{"ok":true}', (args) => (seenArgs = args));
    await complete({ ...OPTIONS, json: true });

    const args = seenArgs as { response_format?: { type: string } };
    expect(args.response_format).toEqual({ type: "json_object" });
  });

  it("requests JSON mime type from Gemini when json: true and Groq is unavailable", async () => {
    let seenArgs: unknown;
    llmMockState.groqClient = null;
    llmMockState.geminiClient = geminiReturning('{"ok":true}', (args) => (seenArgs = args));
    await complete({ ...OPTIONS, json: true });

    const args = seenArgs as { config?: { responseMimeType?: string } };
    expect(args.config?.responseMimeType).toBe("application/json");
  });

  it("maps assistant-role history messages to Gemini's 'model' role", async () => {
    let seenArgs: unknown;
    llmMockState.groqClient = null;
    llmMockState.geminiClient = geminiReturning("ok", (args) => (seenArgs = args));
    await complete({
      ...OPTIONS,
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "second" },
      ],
    });

    const args = seenArgs as { contents: { role: string; parts: { text: string }[] }[] };
    expect(args.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });
});

// Groq's free tier has a daily token cap. Once it's hit, every request would
// otherwise re-attempt a provider we already know is closed for hours.
describe("rate-limit backoff", () => {
  beforeEach(() => {
    resetLlmMockState();
    resetRateLimiter();
  });

  it("stops calling Groq again after it reports a 429", async () => {
    const counter = { calls: 0 };
    llmMockState.groqClient = groqFailing(counter, () => rateLimitError("600")) as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    expect(await complete(OPTIONS)).toBe("Hi from Gemini");
    expect(await complete(OPTIONS)).toBe("Hi from Gemini");
    expect(await complete(OPTIONS)).toBe("Hi from Gemini");

    // Once per model in the lane -- each is its own token bucket, so a 429 from
    // one says nothing about the other -- and then skipped entirely for the
    // rest of both backoff windows. Three complete() calls, two attempts.
    expect(counter.calls).toBe(2);
  });

  it("still serves from Gemini while Groq is paused", async () => {
    llmMockState.groqClient = groqFailing({ calls: 0 }, () => rateLimitError("600")) as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    await complete(OPTIONS);
    expect(await complete(OPTIONS)).toBe("Hi from Gemini");
  });

  it("backs off a 429 that carries no Retry-After header", async () => {
    const counter = { calls: 0 };
    llmMockState.groqClient = groqFailing(counter, () => rateLimitError(null)) as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    await complete(OPTIONS);
    await complete(OPTIONS);
    // Both buckets tried once, then both paused.
    expect(counter.calls).toBe(2);
  });

  it("keeps retrying Groq for an ordinary (non-429) failure", async () => {
    const counter = { calls: 0 };
    llmMockState.groqClient = groqFailing(counter, () => new Error("transient network blip")) as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    await complete(OPTIONS);
    await complete(OPTIONS);
    // No backoff for a transient error, so every bucket is retried every time:
    // two models across two calls.
    expect(counter.calls).toBe(4);
  });

  it("clamps an absurdly large Retry-After so a bad value can't disable a provider for a day", async () => {
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(" "));
    };
    try {
      llmMockState.groqClient = groqFailing({ calls: 0 }, () =>
        rateLimitError("999999999"),
      ) as never;
      llmMockState.geminiClient = geminiReturning("Hi from Gemini");

      await complete(OPTIONS);
    } finally {
      console.warn = originalWarn;
    }

    const backoffWarning = warnings.find((w) => w.includes("rate limited"));
    // Clamped to MAX_BACKOFF_MS rather than the ~11.5 days the header asked for.
    // The cap is 10 minutes, not the hour it used to be: now that admission
    // control budgets tokens before spending them, a long punitive blackout
    // throws away capacity we could be using. Jitter is added on top, so this
    // asserts the order of magnitude rather than an exact string.
    expect(backoffWarning).toMatch(/ 6[0-9]{2}s/);
  });

  it("falls back to a short pause when Retry-After isn't a plain number of seconds", async () => {
    const counter = { calls: 0 };
    // Retry-After is spec-legal as an HTTP-date, not just seconds.
    llmMockState.groqClient = groqFailing(counter, () =>
      rateLimitError("Wed, 21 Oct 2026 07:28:00 GMT"),
    ) as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    await complete(OPTIONS);
    await complete(OPTIONS);
    // Still backs off (doesn't crash or ignore the 429) even though it can't
    // parse this particular format as a duration -- once per bucket.
    expect(counter.calls).toBe(2);
  });

  it("returns null without calling Gemini once Gemini itself is rate limited", async () => {
    let geminiCalls = 0;
    llmMockState.groqClient = null;
    llmMockState.geminiClient = {
      models: {
        generateContent: async () => {
          geminiCalls += 1;
          throw rateLimitError("600");
        },
      },
    } as never;

    expect(await complete(OPTIONS)).toBeNull();
    expect(await complete(OPTIONS)).toBeNull();
    expect(geminiCalls).toBe(1);
  });
});
