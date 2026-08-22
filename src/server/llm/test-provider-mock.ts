import { installModuleMock } from "@/test/mock-module-registry";

/**
 * Shared mock for the two lowest-level LLM provider modules (groqClient,
 * geminiClient). Bun's mock.module() replaces a module path globally for
 * the whole test process, not per-file -- if llmComplete.test.ts,
 * scenarioGenerator.test.ts, and chatbot.test.ts each mocked these
 * independently, whichever file's mock.module call ran last would win for
 * every file, exactly like the "@/api-client" collision documented in
 * src/test/mock-api-client.ts. This lets every test that exercises the real
 * llm/llmComplete.ts `complete()` (which is what all three of those files
 * do -- none of them mock llmComplete.ts itself) share one mocked provider
 * layer, configured per test via this mutable state.
 *
 * The Groq fakes return a `.withResponse()`-shaped result because that is what
 * the real SDK gives and what llmComplete now uses: the rate-limit headers
 * arrive on *success*, which is the only way to know the token budget before
 * spending it rather than after being refused. A fake without headers would let
 * the admission-control path go untested.
 */
interface FakeGroqResponse {
  data: { choices: { message: { content: string | null } }[] };
  response: { headers: Headers };
}
type FakeGroqCreate = (...args: unknown[]) => { withResponse: () => Promise<FakeGroqResponse> };
type FakeGroqClient = { chat: { completions: { create: FakeGroqCreate } } } | null;
type FakeGeminiClient = { models: { generateContent: (...args: unknown[]) => Promise<unknown> } } | null;

export const llmMockState = {
  groqClient: null as FakeGroqClient,
  geminiClient: null as FakeGeminiClient,
};

export function resetLlmMockState() {
  llmMockState.groqClient = null;
  llmMockState.geminiClient = null;
}

/** Lane models the mock reports. Distinct strings so per-lane bucketing is observable. */
const MOCK_LANE_MODELS = {
  draft: ["mock-draft-model", "mock-draft-alt"],
  refine: ["mock-refine-model", "mock-refine-alt"],
  chat: ["mock-chat-model", "mock-chat-alt"],
} as const;

/**
 * Idempotent -- safe to call from every test file that exercises llmComplete's real logic.
 *
 * The specifiers are spelled with the "@/" alias rather than the "./groqClient"
 * llmComplete.ts itself uses, because Bun resolves a relative specifier against
 * the file calling mock.module() -- which is now the registry, not this file.
 * Both spellings resolve to the same file, which is what the module registry
 * keys on.
 */
export function installLlmProviderMocks() {
  installModuleMock("@/server/llm/groqClient", "@/server/llm/test-provider-mock", () => ({
    getGroqClient: () => llmMockState.groqClient,
    GROQ_LANE_MODELS: MOCK_LANE_MODELS,
    // Small, so a test's prompt does not have to be long to exercise the budget.
    GROQ_LANE_MAX_TOKENS: { draft: 100, refine: 100, chat: 100 },
    GROQ_DEFAULT_LANE: "chat",
  }));
  installModuleMock("@/server/llm/geminiClient", "@/server/llm/test-provider-mock", () => ({
    getGeminiClient: () => llmMockState.geminiClient,
    GEMINI_MODEL: "mock-gemini-model",
  }));
}

/** Headers a real Groq response carries, so reconciliation can be asserted. */
export function rateLimitHeaders(remainingTokens?: number, limitTokens = 8_000): Headers {
  const headers = new Headers();
  if (remainingTokens !== undefined) {
    headers.set("x-ratelimit-remaining-tokens", String(remainingTokens));
    headers.set("x-ratelimit-limit-tokens", String(limitTokens));
  }
  return headers;
}

function groqResult(content: string | null, headers: Headers): FakeGroqResponse {
  return { data: { choices: [{ message: { content } }] }, response: { headers } };
}

export function groqReturning(
  content: string | null,
  onCall?: (args: unknown) => void,
  headers: Headers = rateLimitHeaders(),
): NonNullable<FakeGroqClient> {
  return {
    chat: {
      completions: {
        create: (args: unknown) => {
          onCall?.(args);
          return { withResponse: async () => groqResult(content, headers) };
        },
      },
    },
  };
}

/** Returns a queued response per successive call -- e.g. for a two-stage draft-then-refine pipeline. */
export function groqReturningInOrder(...contents: (string | null)[]): NonNullable<FakeGroqClient> {
  let call = 0;
  return {
    chat: {
      completions: {
        create: () => {
          const content = call < contents.length ? contents[call]! : null;
          call++;
          return { withResponse: async () => groqResult(content, rateLimitHeaders()) };
        },
      },
    },
  };
}

/** Throws with an optional status/headers, so 429 and 404 handling can be tested. */
export function groqThrowing(
  message: string,
  extra: { status?: number; headers?: Record<string, string> } = {},
): NonNullable<FakeGroqClient> {
  return {
    chat: {
      completions: {
        create: () => ({
          withResponse: async () => {
            const err = Object.assign(new Error(message), extra);
            throw err;
          },
        }),
      },
    },
  };
}

export function geminiReturning(
  text: string | null,
  onCall?: (args: unknown) => void,
): NonNullable<FakeGeminiClient> {
  return {
    models: {
      generateContent: async (args: unknown) => {
        onCall?.(args);
        return { text };
      },
    },
  };
}

export function geminiThrowing(message: string): NonNullable<FakeGeminiClient> {
  return {
    models: {
      generateContent: async () => {
        throw new Error(message);
      },
    },
  };
}
