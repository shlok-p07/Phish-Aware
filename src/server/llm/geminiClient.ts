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

/** Backup provider for when Groq is unconfigured, rate-limited, or erroring. */
export const GEMINI_MODEL = "gemini-2.5-flash";
