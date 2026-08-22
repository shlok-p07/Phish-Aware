import { describe, expect, it, beforeEach } from "bun:test";
import type { ChatMessage } from "./chatbot";
import { installLlmProviderMocks, llmMockState, resetLlmMockState, groqReturning, groqThrowing } from "./llm/test-provider-mock";
import { resetRateLimiter } from "./llm/rateLimiter";

installLlmProviderMocks();

const { getChatbotReply } = await import("./chatbot");

const HISTORY: ChatMessage[] = [{ role: "user", content: "Why was that email suspicious?" }];

describe("getChatbotReply", () => {
  beforeEach(() => {
    resetLlmMockState();
    // Token budgets are process-global, so a drained bucket would leak
    // into the next case and make acquire() wait out the test timeout.
    resetRateLimiter();
  });

  it("returns null when no provider is configured", async () => {
    const result = await getChatbotReply(HISTORY);
    expect(result).toBeNull();
  });

  it("returns the trimmed reply text on success", async () => {
    llmMockState.groqClient = groqReturning("  It used urgency language to rush you.  ");
    const result = await getChatbotReply(HISTORY);
    expect(result).toBe("It used urgency language to rush you.");
  });

  it("sends a grounding system prompt referencing the product's own cue vocabulary", async () => {
    let seenArgs: unknown;
    llmMockState.groqClient = groqReturning("ok", (args) => (seenArgs = args));
    await getChatbotReply(HISTORY);

    const args = seenArgs as { messages: { role: string; content: string }[] };
    expect(args.messages[0]!.role).toBe("system");
    expect(args.messages[0]!.content).toContain("Mismatched sender domain");
    expect(args.messages[0]!.content).toContain("Urgency");
    expect(args.messages.at(-1)).toEqual(HISTORY[0]);
  });

  it("truncates history to the most recent messages so token usage stays bounded", async () => {
    let seenArgs: unknown;
    llmMockState.groqClient = groqReturning("ok", (args) => (seenArgs = args));
    const longHistory: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));
    await getChatbotReply(longHistory);

    const args = seenArgs as { messages: unknown[] };
    // system prompt + at most MAX_HISTORY_MESSAGES (12)
    expect(args.messages.length).toBeLessThanOrEqual(13);
  });

  it("returns null when the completion has no content", async () => {
    llmMockState.groqClient = groqReturning(null);
    const result = await getChatbotReply(HISTORY);
    expect(result).toBeNull();
  });

  it("returns null (not a throw) when both providers fail", async () => {
    llmMockState.groqClient = groqThrowing("network down");
    const result = await getChatbotReply(HISTORY);
    expect(result).toBeNull();
  });

  it("strips **bold** markdown the model sometimes uses despite being told not to", async () => {
    llmMockState.groqClient = groqReturning("Check the **sender's email address** carefully.");
    const result = await getChatbotReply(HISTORY);
    expect(result).toBe("Check the sender's email address carefully.");
  });

  it("strips markdown headers", async () => {
    llmMockState.groqClient = groqReturning("### Red flags\nWatch for urgency.");
    const result = await getChatbotReply(HISTORY);
    expect(result).not.toContain("#");
    expect(result).toContain("Watch for urgency.");
  });

  it("strips leading bullet markers from list-formatted replies", async () => {
    llmMockState.groqClient = groqReturning("- Check the sender\n- Watch for urgency\n* Verify the link");
    const result = await getChatbotReply(HISTORY);
    expect(result).not.toMatch(/^[ \t]*[-*]\s/m);
    expect(result).toContain("Check the sender");
    expect(result).toContain("Verify the link");
  });

  it("leaves plain prose with no markdown completely unchanged", async () => {
    const plain = "The sender domain was spoofed, and the message leaned on urgency to rush you.";
    llmMockState.groqClient = groqReturning(plain);
    const result = await getChatbotReply(HISTORY);
    expect(result).toBe(plain);
  });

  it("strips single-asterisk emphasis, not just double-asterisk bold", async () => {
    llmMockState.groqClient = groqReturning("Check the *sender domain* carefully.");
    const result = await getChatbotReply(HISTORY);
    expect(result).toBe("Check the sender domain carefully.");
  });

  it("drops a dangling, never-closed ** instead of leaving it literal", async () => {
    llmMockState.groqClient = groqReturning("This is **never closed and keeps going.");
    const result = await getChatbotReply(HISTORY);
    expect(result).not.toContain("*");
    expect(result).toContain("This is never closed and keeps going.");
  });

  it("handles adjacent/nested-looking bold markers without leaving stray asterisks", async () => {
    llmMockState.groqClient = groqReturning("**outer **inner** more**");
    const result = await getChatbotReply(HISTORY);
    expect(result).not.toContain("*");
  });

  it("treats a blank reply the same as no reply, rather than showing an empty message", async () => {
    llmMockState.groqClient = groqReturning("   ");
    const result = await getChatbotReply(HISTORY);
    expect(result).toBeNull();
  });
});
