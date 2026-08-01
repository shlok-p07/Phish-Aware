import { complete } from "./llm/llmComplete";
import { CUE_LABELS } from "./cues";
import { ATTACK_TYPE_LABELS, PERSUASION_TACTIC_LABELS } from "./attackProfiles";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Keeps token usage bounded regardless of how long a conversation runs. */
const MAX_HISTORY_MESSAGES = 12;

/**
 * Grounds the assistant in PhishAware's own taxonomy (the exact cue,
 * attack-type, and persuasion-tactic vocabulary the practice loop and
 * scenario generator use) rather than generic phishing trivia, so its
 * explanations reinforce the same vocabulary the product teaches. This is
 * the same "inject structured domain context into the prompt" idea
 * cyber-exercise-generation research (e.g. LLM-based scenario generators
 * that ground output in a curated knowledge base rather than free
 * generation) uses to keep output relevant and consistent -- here the
 * "retrieval" is just the app's own fixed taxonomy rather than a vector
 * store, since that's the entire corpus this assistant needs.
 */
function buildSystemPrompt(): string {
  const cueList = Object.values(CUE_LABELS).join(", ");
  const attackTypeList = Object.values(ATTACK_TYPE_LABELS).join(", ");
  const tacticList = Object.values(PERSUASION_TACTIC_LABELS).join(", ");

  return `You are the PhishAware Assistant, built into a workplace security-awareness training product. You help employees understand phishing and social engineering so they get better at spotting it -- you are a coach, not a generic chatbot.

Ground your answers in this product's own vocabulary whenever relevant:
- Red-flag cue types: ${cueList}
- Attack types: ${attackTypeList}
- Persuasion tactics attackers lean on: ${tacticList}

Guidelines:
- Be warm, specific, and encouraging -- never condescending. Assume the person asking is trying to learn, even if they got something wrong in practice.
- Explain the "why" behind red flags in plain language, tying back to the cue/attack-type/tactic vocabulary above where it fits naturally.
- If asked about a scenario from the practice loop, reason about the specific cues/tactic mentioned rather than giving a generic answer.
- Refuse, briefly and without lecturing, if asked to draft phishing content intended for a real target, help evade email security filters, or anything outside security-awareness education. Redirect back to what you can help with.
- Keep answers short: two or three plain sentences for most questions, a short paragraph at most for something that genuinely needs more.
- Write in plain flowing sentences, the way you'd talk someone through it out loud. Never use markdown formatting of any kind -- no **bold**, no numbered or bulleted lists, no headers. This is read as plain text, and a wall of bolded list items is exactly the stiff, robotic tone to avoid. If you're explaining more than one red flag, work them into a sentence or two ("the sender domain was off, and it also leaned on urgency") instead of listing them out.
- Write like a real person explaining something to a colleague who isn't especially technical, not like an AI assistant. Never use an em dash (use a period or comma instead). Avoid stock AI phrasing like "I hope this helps," "let's dive in," "in today's digital landscape," "unlock," "leverage," or "seamless."`;
}

/**
 * The system prompt asks the model not to use markdown, but that's a
 * request, not a guarantee -- models still slip into bold text and numbered
 * lists sometimes. The chat widget renders replies as plain text, so any
 * markdown that gets through shows up as literal asterisks and dashes on
 * screen. This strips the common cases as a backstop, rather than trusting
 * prompt compliance alone.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold** -> bold
    .replace(/^#{1,6}\s+/gm, "") // "### Heading" -> "Heading"
    .replace(/^[ \t]*[-*]\s+/gm, ""); // "- item" / "* item" -> "item"
}

/**
 * Sends a bounded conversation with the grounding system prompt prepended.
 * Tries Groq first, then falls back to Gemini on any failure (see
 * llm/llmComplete.ts) so a single provider's rate limit or outage never
 * surfaces to the user as a stall -- the assistant just keeps answering
 * from whichever provider is available. Returns null only if both
 * providers are unconfigured/fail, so callers can surface a clean
 * "assistant unavailable" response rather than blocking the chat UI.
 */
export async function getChatbotReply(messages: ChatMessage[]): Promise<string | null> {
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);

  const reply = await complete({
    system: buildSystemPrompt(),
    messages: trimmed,
    temperature: 0.6,
  });

  return reply ? stripMarkdown(reply) : reply;
}
