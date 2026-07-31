import Groq from "groq-sdk";

// Lazy + cached on globalThis, same pattern as src/db/client.ts's MongoClient
// caching -- avoids re-instantiating on every Next.js dev-mode hot reload.
const globalForGroq = globalThis as unknown as { _groqClient?: Groq };

/** Null when GROQ_API_KEY isn't set, so callers can fall back to the static seed pool. */
export function getGroqClient(): Groq | null {
  if (!process.env.GROQ_API_KEY) {
    return null;
  }
  if (!globalForGroq._groqClient) {
    globalForGroq._groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return globalForGroq._groqClient;
}

/** Strong general-purpose free-tier model; good instruction-following for structured JSON output. */
export const GROQ_MODEL = "llama-3.3-70b-versatile";
