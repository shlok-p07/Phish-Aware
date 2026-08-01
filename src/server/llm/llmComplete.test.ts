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

const OPTIONS: CompleteOptions = {
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello" }],
  temperature: 0.5,
};

describe("complete (Groq -> Gemini fallback)", () => {
  beforeEach(() => {
    resetLlmMockState();
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
