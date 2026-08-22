import {
  getGroqClient,
  GROQ_LANE_MODELS,
  GROQ_LANE_MAX_TOKENS,
  GROQ_DEFAULT_LANE,
} from "./groqClient";
import { getGeminiClient, GEMINI_MODEL } from "./geminiClient";
import {
  acquire,
  bucketKey,
  isModelGone,
  MODEL_GONE_BACKOFF_MS,
  noteBackoff,
  recordUsage,
  reconcile,
  release,
  retryAfterMs,
  type Lane,
  type Priority,
} from "./rateLimiter";

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
  /**
   * Which token bucket to spend from. Each lane pins its own model, so the two
   * generation stages and the chatbot never compete for the same budget.
   */
  lane?: Lane;
  /**
   * Whether somebody is waiting. Interactive calls skip the queue and keep a
   * reserved slice of budget; background calls yield and are willing to wait a
   * refill window. Defaults to interactive, so a caller that forgets is treated
   * as urgent rather than starved.
   */
  priority?: Priority;
}

// 8s cut off a legitimate (just slower than usual) Gemini JSON-mode
// generation call in live testing, which is worse than useless as a
// fallback trigger -- there's no third provider to catch that failure.
// 20s comfortably covers the real-world latency range seen from both
// providers while still bounding worst-case request time.
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

// Groq/Gemini failures here are routine (rate limits, transient provider
// overload) and already handled by the fallback logic around this function -- a
// full error object is noise for something this expected, so just the message is
// logged, at warn rather than error since nothing is actually broken.
function shortMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Characters of prompt, which is what the token estimate is derived from. */
function promptChars(options: CompleteOptions): number {
  return options.system.length + options.messages.reduce((total, m) => total + m.content.length, 0);
}

function headerNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Groq, through admission control.
 *
 * withResponse() is what makes the accounting real: the rate-limit headers come
 * back on *success*, so the budget is known before the next call rather than
 * discovered by being refused. Previously the only signal was a 429 after the
 * fact, which meant every limit event cost a wasted request.
 */
async function completeWithGroq(
  options: CompleteOptions,
  lane: Lane,
  priority: Priority,
): Promise<string | null> {
  const client = getGroqClient();
  if (!client) {
    warnUnconfigured("Groq");
    return null;
  }

  const maxTokens = GROQ_LANE_MAX_TOKENS[lane];
  const estimated = Math.ceil(promptChars(options) / 4) + maxTokens;
  let lastError: unknown = null;

  // Each model is its own token bucket, so a second entry is a fresh budget
  // rather than a wait. Worth trying before Gemini, whose free tier allows 20
  // requests a day.
  for (const model of GROQ_LANE_MODELS[lane]) {
    const key = bucketKey("groq", model);
    const slot = await acquire(key, estimated, priority);
    if (!slot.ok) {
      // Not an error: this bucket is spoken for, so try the next model.
      continue;
    }

    try {
      const { data, response } = await client.chat.completions
        .create(
          {
            model,
            messages: [
              { role: "system", content: options.system },
              ...options.messages.map((m) => ({ role: m.role, content: m.content })),
            ],
            temperature: options.temperature,
            max_tokens: maxTokens,
            ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
          },
          { timeout: STAGE_TIMEOUT_MS },
        )
        .withResponse();

      reconcile(key, {
        remainingTokens: headerNumber(response.headers, "x-ratelimit-remaining-tokens"),
        limitTokens: headerNumber(response.headers, "x-ratelimit-limit-tokens"),
      });
      recordUsage(key, data.usage?.total_tokens);

      const choice = data.choices[0];
      // A completion cut off at max_tokens is not a soft failure when the caller
      // asked for JSON: the text is unparseable, so generation fails with a
      // confusing syntax error rather than anything that points at the cap.
      // Groq's JSON mode reports it as `json_validate_failed`, which reads like a
      // prompt problem. Worth naming, because the fix is a constant.
      if (choice?.finish_reason === "length") {
        console.warn(
          `[llm] groq ${lane}/${model} hit the ${maxTokens}-token completion cap and was truncated` +
            (options.json ? " -- the JSON will not parse; raise GROQ_LANE_MAX_TOKENS." : "."),
        );
      }

      const content = choice?.message?.content?.trim();
      if (content) return content;
      // An empty body is not worth burning another model's budget on twice.
      lastError = new Error("empty completion");
    } catch (err) {
      lastError = err;
      noteGroqFailure(key, lane, model, err);
      console.warn(`[llm] groq ${lane}/${model} failed:`, shortMessage(err));
    } finally {
      release(key);
    }
  }

  if (lastError === null) {
    console.warn(`[llm] every groq model for ${lane} was busy or out of budget`);
  }
  return null;
}

function noteGroqFailure(key: string, lane: Lane, model: string, err: unknown): void {
  if (isModelGone(err)) {
    // Loud and specific: this is a configuration problem that silently redirects
    // all traffic to the fallback provider until someone changes a constant.
    noteBackoff(
      key,
      MODEL_GONE_BACKOFF_MS,
      `model ${model} is unavailable (decommissioned or no access) -- update GROQ_LANE_MODELS[${lane}]`,
    );
    return;
  }
  const retryAfter = retryAfterMs(err);
  if (retryAfter !== null) {
    noteBackoff(key, retryAfter, "rate limited");
  }
}

/**
 * Gemini, the fallback.
 *
 * Its SDK does not surface rate-limit headers, so this bucket is accounted for by
 * estimate alone and corrected reactively from 429s. That is the weaker of the
 * two arrangements, which is part of why Groq is tried first.
 */
async function completeWithGemini(
  options: CompleteOptions,
  priority: Priority,
): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) {
    warnUnconfigured("Gemini");
    return null;
  }

  const key = bucketKey("gemini", GEMINI_MODEL);
  const estimated = Math.ceil(promptChars(options) / 4) + 2_000;
  const slot = await acquire(key, estimated, priority);
  if (!slot.ok) {
    console.warn(`[llm] skipped gemini (${slot.reason}), ~${estimated} tokens wanted`);
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
  } catch (err) {
    const retryAfter = retryAfterMs(err);
    // Gemini reports quota exhaustion as a 429 whose body, not header, carries
    // the detail; a plain default pause is the best available response.
    noteBackoff(key, retryAfter ?? 60_000, "rate limited or out of quota");
    throw err;
  } finally {
    clearTimeout(timer);
    release(key);
  }
}

/**
 * Tries Groq first, then Gemini, and gives up rather than blocking a request.
 *
 * Both providers are gated by the same token-budget admission control, so a
 * burst of background pool top-ups can no longer spend a minute's worth of
 * budget in one go and 429 everything behind it. Returns null when both are
 * unconfigured, exhausted or failing -- every caller already has a non-LLM
 * fallback (the stored scenario pool, or a friendly chat error), and serving
 * from those beats making a trainee wait.
 */
export async function complete(options: CompleteOptions): Promise<string | null> {
  const lane = options.lane ?? GROQ_DEFAULT_LANE;
  const priority = options.priority ?? "interactive";

  const groqResult = await completeWithGroq(options, lane, priority);
  if (groqResult) return groqResult;

  try {
    return await completeWithGemini(options, priority);
  } catch (err) {
    console.warn("[llm] gemini failed, no more providers to fall back to:", shortMessage(err));
    return null;
  }
}
