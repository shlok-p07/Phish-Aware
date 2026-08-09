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
 */
type FakeGroqClient = { chat: { completions: { create: (...args: unknown[]) => Promise<unknown> } } } | null;
type FakeGeminiClient = { models: { generateContent: (...args: unknown[]) => Promise<unknown> } } | null;

export const llmMockState = {
  groqClient: null as FakeGroqClient,
  geminiClient: null as FakeGeminiClient,
};

export function resetLlmMockState() {
  llmMockState.groqClient = null;
  llmMockState.geminiClient = null;
}

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
    GROQ_MODEL: "llama-3.3-70b-versatile",
  }));
  installModuleMock("@/server/llm/geminiClient", "@/server/llm/test-provider-mock", () => ({
    getGeminiClient: () => llmMockState.geminiClient,
    GEMINI_MODEL: "gemini-2.5-flash",
  }));
}

export function groqReturning(content: string | null, onCall?: (args: unknown) => void): NonNullable<FakeGroqClient> {
  return {
    chat: {
      completions: {
        create: async (args: unknown) => {
          onCall?.(args);
          return { choices: [{ message: { content } }] };
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
        create: async () => {
          const content = call < contents.length ? contents[call]! : null;
          call++;
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
}

export function groqThrowing(message: string): NonNullable<FakeGroqClient> {
  return {
    chat: {
      completions: {
        create: async () => {
          throw new Error(message);
        },
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
