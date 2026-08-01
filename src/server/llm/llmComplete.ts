import { getGroqClient, GROQ_MODEL } from "./groqClient";
import { getGeminiClient, GEMINI_MODEL } from "./geminiClient";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  system: string;
  messages: LlmMessage[];
  temperature: number;
  /** Request strict JSON output from whichever provider serves the call. */
  json?: boolean;
}

// 8s cut off a legitimate (just slower than usual) Gemini JSON-mode
// generation call in live testing, which is worse than useless as a
// fallback trigger -- there's no third provider to catch that failure.
// 20s comfortably covers the real-world latency range seen from both
// providers (Groq: ~1-7s/call even under free-tier throttling; Gemini
// JSON-mode generation: occasionally slower than Groq) while still
// bounding worst-case request time to something reasonable.
const STAGE_TIMEOUT_MS = 20_000;

async function completeWithGroq(options: CompleteOptions): Promise<string | null> {
  const client = getGroqClient();
  if (!client) return null;

  const completion = await client.chat.completions.create(
    {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: options.system },
        ...options.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: options.temperature,
      ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
    },
    { timeout: STAGE_TIMEOUT_MS },
  );

  return completion.choices[0]?.message?.content?.trim() || null;
}

async function completeWithGemini(options: CompleteOptions): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STAGE_TIMEOUT_MS);
  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: options.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: options.system,
        temperature: options.temperature,
        abortSignal: controller.signal,
        ...(options.json ? { responseMimeType: "application/json" } : {}),
      },
    });
    return response.text?.trim() || null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tries Groq first (fast, generous free-tier RPM), and falls back to Gemini
 * on ANY failure -- missing key, rate limit, timeout, network error, or an
 * empty response. This is what keeps scenario generation and the chatbot
 * from ever surfacing a Groq-side hiccup to the user: if Groq is
 * unconfigured or has burned through its free-tier budget for the minute,
 * the exact same call quietly gets served by Gemini instead, and vice versa
 * (each provider is tried independently on every call, not "sticky" to
 * whichever answered last). Returns null only if both providers are
 * unconfigured or both fail -- callers already have their own null-safe
 * fallback (the static scenario pool / a friendly chat error message).
 */
export async function complete(options: CompleteOptions): Promise<string | null> {
  try {
    const groqResult = await completeWithGroq(options);
    if (groqResult) return groqResult;
  } catch (err) {
    console.error("[llm] Groq call failed, falling back to Gemini:", err);
  }

  try {
    return await completeWithGemini(options);
  } catch (err) {
    console.error("[llm] Gemini call failed (no more providers to fall back to):", err);
    return null;
  }
}
