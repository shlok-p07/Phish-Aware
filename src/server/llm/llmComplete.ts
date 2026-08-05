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

// An unconfigured provider used to fail completely silently: no throw, no log,
// just a null. That makes a missing API key indistinguishable in the logs from
// a provider that answered fine, which is exactly the wrong thing to be unsure
// about when generation has stopped working. Warned once per process.
const warnedUnconfigured = new Set<string>();

function warnUnconfigured(provider: string): void {
  if (warnedUnconfigured.has(provider)) return;
  warnedUnconfigured.add(provider);
  console.warn(
    `[llm] ${provider} is not configured (missing API key) -- it will be skipped on every call.`,
  );
}

async function completeWithGroq(options: CompleteOptions): Promise<string | null> {
  const client = getGroqClient();
  if (!client) {
    warnUnconfigured("Groq");
    return null;
  }

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
  if (!client) {
    warnUnconfigured("Gemini");
    return null;
  }

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
// Groq/Gemini failures here are routine (rate limits, transient provider
// overload) and already handled by the fallback/cooldown logic around this
// function -- a full error object (headers, stack, retry-after, ...) is
// noise for something this expected, so just the message is logged, at
// warn rather than error since nothing is actually broken.
function shortMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * When a provider hands back a 429 it also tells us how long to stay away --
 * a daily-token-limit rejection can ask for ten minutes. Without honouring
 * that, every subsequent request re-attempts a provider we already know is
 * closed: wasted round trips, and one log line per request for a condition
 * that resolves on a clock. Calls made while a provider is backing off skip
 * it entirely and go straight to the other one.
 */
type ProviderName = "groq" | "gemini";
const backoffUntil = new Map<ProviderName, number>();

/** Cap so a malformed or absurd Retry-After can't disable a provider for a day. */
const MAX_BACKOFF_MS = 60 * 60 * 1000;

function readRetryAfterMs(err: unknown): number | null {
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
  // A 429 with no usable Retry-After still deserves a pause, just a short one.
  if (!Number.isFinite(seconds) || seconds <= 0) return 60_000;
  return Math.min(seconds * 1000, MAX_BACKOFF_MS);
}

function isBackingOff(provider: ProviderName): boolean {
  const until = backoffUntil.get(provider);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    backoffUntil.delete(provider);
    return false;
  }
  return true;
}

function noteFailure(provider: ProviderName, err: unknown, note: string): void {
  const retryAfterMs = readRetryAfterMs(err);
  if (retryAfterMs !== null) {
    backoffUntil.set(provider, Date.now() + retryAfterMs);
    // Logged once per backoff window rather than once per request.
    console.warn(
      `[llm] ${provider} is rate limited, pausing it for ${Math.round(retryAfterMs / 1000)}s. ${note}`,
    );
    return;
  }
  console.warn(`[llm] ${provider} call failed, ${note}:`, shortMessage(err));
}

/** Test seam -- provider backoff is process-global and would otherwise leak between cases. */
export function resetLlmBackoff(): void {
  backoffUntil.clear();
}

export async function complete(options: CompleteOptions): Promise<string | null> {
  if (!isBackingOff("groq")) {
    try {
      const groqResult = await completeWithGroq(options);
      if (groqResult) return groqResult;
    } catch (err) {
      noteFailure("groq", err, "falling back to Gemini");
    }
  }

  if (isBackingOff("gemini")) return null;

  try {
    return await completeWithGemini(options);
  } catch (err) {
    noteFailure("gemini", err, "no more providers to fall back to");
    return null;
  }
}
