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

const { complete, resetLlmBackoff } = await import("./llmComplete");

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

const OPTIONS: CompleteOptions = {
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello" }],
  temperature: 0.5,
};

describe("complete (Groq -> Gemini fallback)", () => {
  beforeEach(() => {
    resetLlmMockState();
    resetLlmBackoff();
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
    resetLlmBackoff();
  });

  it("stops calling Groq again after it reports a 429", async () => {
    let groqCalls = 0;
    llmMockState.groqClient = {
      chat: {
        completions: {
          create: async () => {
            groqCalls += 1;
            throw rateLimitError("600");
          },
        },
      },
    } as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    expect(await complete(OPTIONS)).toBe("Hi from Gemini");
    expect(await complete(OPTIONS)).toBe("Hi from Gemini");
    expect(await complete(OPTIONS)).toBe("Hi from Gemini");

    // Called once, then skipped for the rest of the backoff window.
    expect(groqCalls).toBe(1);
  });

  it("still serves from Gemini while Groq is paused", async () => {
    llmMockState.groqClient = {
      chat: { completions: { create: async () => { throw rateLimitError("600"); } } },
    } as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    await complete(OPTIONS);
    expect(await complete(OPTIONS)).toBe("Hi from Gemini");
  });

  it("backs off a 429 that carries no Retry-After header", async () => {
    let groqCalls = 0;
    llmMockState.groqClient = {
      chat: {
        completions: {
          create: async () => {
            groqCalls += 1;
            throw rateLimitError(null);
          },
        },
      },
    } as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    await complete(OPTIONS);
    await complete(OPTIONS);
    expect(groqCalls).toBe(1);
  });

  it("keeps retrying Groq for an ordinary (non-429) failure", async () => {
    let groqCalls = 0;
    llmMockState.groqClient = {
      chat: {
        completions: {
          create: async () => {
            groqCalls += 1;
            throw new Error("transient network blip");
          },
        },
      },
    } as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    await complete(OPTIONS);
    await complete(OPTIONS);
    expect(groqCalls).toBe(2);
  });

  it("clamps an absurdly large Retry-After so a bad value can't disable a provider for a day", async () => {
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(" "));
    };
    try {
      llmMockState.groqClient = {
        chat: { completions: { create: async () => { throw rateLimitError("999999999"); } } },
      } as never;
      llmMockState.geminiClient = geminiReturning("Hi from Gemini");

      await complete(OPTIONS);
    } finally {
      console.warn = originalWarn;
    }

    const backoffWarning = warnings.find((w) => w.includes("rate limited"));
    // MAX_BACKOFF_MS is 1 hour -- 3600s, not the ~11.5 days the raw header asked for.
    expect(backoffWarning).toContain("3600s");
  });

  it("falls back to a short pause when Retry-After isn't a plain number of seconds", async () => {
    let groqCalls = 0;
    llmMockState.groqClient = {
      chat: {
        completions: {
          create: async () => {
            groqCalls += 1;
            // Retry-After is spec-legal as an HTTP-date, not just seconds.
            throw rateLimitError("Wed, 21 Oct 2026 07:28:00 GMT");
          },
        },
      },
    } as never;
    llmMockState.geminiClient = geminiReturning("Hi from Gemini");

    await complete(OPTIONS);
    await complete(OPTIONS);
    // Still backs off (doesn't crash or ignore the 429) even though it can't
    // parse this particular format as a duration.
    expect(groqCalls).toBe(1);
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
