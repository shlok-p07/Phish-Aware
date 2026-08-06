/**
 * Transcript handling for the simulated vishing call.
 *
 * The point of the voice exercise is that the learner *listens* -- a real
 * vishing victim never gets a script in front of them. So the transcript is
 * revealed line by line as the synthesized caller actually speaks it, rather
 * than handed over up front. These helpers are the pure part of that: parsing
 * the stored body into speakable lines, and mapping a speech-synthesis
 * character offset back onto a word so the caption can track the voice.
 */

export interface TranscriptLine {
  /** What the caller says, with the stored "Caller:" prefix removed. */
  text: string;
}

/**
 * Whitespace sitting in front of a `Caller:`/`You:` label that isn't already at
 * the start of a line. Anchored with `m` so labels that do start their own line
 * are left alone.
 */
const SPEAKER_MID_LINE = /(?!^)[ \t]*(?=(?:Caller|You)\s*:)/gim;

/**
 * Splits a stored voice scenario body into the lines the caller speaks.
 *
 * Stored bodies are consecutive `Caller: ...` lines (see the voice brief in
 * server/scenarioGenerator.ts). The prefix is display furniture, not something
 * the voice should read aloud.
 *
 * Generated bodies don't always honour that contract: the model frequently
 * returns every turn run together on one line, because emitting a real newline
 * inside a JSON string is exactly the sort of thing it gets wrong. Splitting on
 * "\n" alone then yields a single line, which is not a cosmetic problem -- the
 * whole transcript lands in one lump instead of tracking the voice, one
 * utterance is queued instead of several, and the call ends seconds after it
 * connects. So a speaker label appearing mid-line is treated as a line break
 * too.
 */
export function parseTranscript(body: string): TranscriptLine[] {
  return body
    .replace(SPEAKER_MID_LINE, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ text: line.replace(/^(?:Caller|You)\s*:\s*/i, "").trim() }))
    .filter((line) => line.text.length > 0);
}

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

/** Word ranges within a line, so a boundary offset can be mapped onto one. */
export function splitWords(text: string): CaptionWord[] {
  const words: CaptionWord[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return words;
}

/**
 * Which word a `boundary` event's charIndex falls in.
 *
 * Browsers disagree about whether charIndex points at the start of the word or
 * somewhere inside it, so this takes the last word starting at or before the
 * offset rather than requiring an exact match. Returns -1 when nothing matches,
 * which the caption renders as "no word highlighted" rather than throwing.
 */
export function wordIndexAt(words: CaptionWord[], charIndex: number): number {
  if (charIndex < 0) return -1;
  let found = -1;
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (word.start <= charIndex) found = i;
    if (word.end > charIndex) break;
  }
  return found;
}

/** mm:ss for the in-call timer. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
