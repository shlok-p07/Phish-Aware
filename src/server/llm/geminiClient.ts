import { GoogleGenAI } from "@google/genai";

// Lazy + cached on globalThis, same pattern as groqClient.ts and
// src/db/client.ts's MongoClient caching -- avoids re-instantiating on
// every Next.js dev-mode hot reload.
const globalForGemini = globalThis as unknown as { _geminiClient?: GoogleGenAI };

/** Null when GEMINI_API_KEY isn't set, so callers can fall back / skip this provider. */
export function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!globalForGemini._geminiClient) {
    globalForGemini._geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return globalForGemini._geminiClient;
}

/**
 * Backup provider for when Groq is unconfigured, rate-limited, or erroring.
 * Pinned versions (e.g. "gemini-2.5-flash") get cut off from new
 * projects/keys over time -- "-latest" is Google's alias that always
 * resolves to whatever flash model is currently open to new users.
 */
export const GEMINI_MODEL = "gemini-flash-latest";
