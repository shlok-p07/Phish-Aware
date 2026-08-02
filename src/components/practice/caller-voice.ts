// Casting for the simulated vishing call.
//
// Nothing here is user-selectable on purpose. Asking a learner to pick a
// "voice style" before they've heard the call is a question they have no basis
// to answer, and it leaks that the delivery is a variable worth thinking about.
// Instead the caller is cast from the scenario itself: the same scenario always
// sounds the same, different scenarios sound different, and how the caller
// speaks matches the situation the scenario describes.

export type CallerAccent = "en-GB" | "en-US";
export type CallerGender = "female" | "male";
export type CallerDelivery = "pressuring" | "authoritative" | "reassuring" | "natural";

export interface CallerVoiceProfile {
  accent: CallerAccent;
  gender: CallerGender;
  delivery: CallerDelivery;
  rate: number;
  pitch: number;
}

// The only voices we're willing to cast. Platform voice lists are full of
// novelty entries (Bubbles, Jester, Bad News, Zarvox...) that turn a call meant
// to feel real into a joke, so we name the four slots we want -- UK and US, one
// woman and one man -- and accept only known-good voices for each.
const VOICE_NAMES: Record<CallerAccent, Record<CallerGender, string[]>> = {
  "en-GB": {
    female: ["Google UK English Female", "Microsoft Sonia", "Microsoft Libby", "Microsoft Hazel", "Serena", "Kate", "Stephanie", "Martha"],
    male: ["Google UK English Male", "Microsoft Ryan", "Microsoft George", "Daniel", "Oliver", "Arthur"],
  },
  "en-US": {
    female: ["Google US English", "Microsoft Aria", "Microsoft Jenny", "Microsoft Zira", "Samantha", "Ava", "Allison", "Susan"],
    male: ["Microsoft Guy", "Microsoft Eric", "Microsoft David", "Microsoft Mark", "Alex", "Tom", "Aaron", "Nathan"],
  },
};

// Safety net for the generic fallback below, where we're matching on language
// rather than on a name we chose. These are the comic/childish system voices.
const NOVELTY_VOICES = [
  "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "deranged",
  "eddy", "flo", "fred", "good news", "grandma", "grandpa", "hysterical", "jester",
  "junior", "kathy", "organ", "princess", "ralph", "reed", "rocko", "sandy",
  "shelley", "superstar", "trinoids", "whisper", "wobble", "zarvox",
];

const isNovelty = (voice: SpeechSynthesisVoice) => {
  const name = voice.name.toLowerCase();
  return NOVELTY_VOICES.some((n) => name.includes(n));
};

// Wording that places the scenario in the UK. A "call from HMRC about your
// National Insurance number" landing in an American accent is the kind of
// mismatch that makes the simulation feel synthetic.
const UK_MARKERS = [
  "hmrc", "nhs", "royal mail", "dvla", "tv licence", "tv licensing", "national insurance",
  "barclays", "lloyds", "natwest", "halifax", "santander uk", "building society",
  "£", "gbp", "pounds", "pence", "post code", "postcode", "mobile number",
  "+44", "0800", "0300", "council tax", "ofcom", "companies house",
];

const PRESSURE_MARKERS = [
  "immediately", "right now", "within the next", "minutes", "expire", "expires", "expiring",
  "suspend", "suspended", "locked", "lock your", "final notice", "last chance", "act now",
  "before it's too late", "urgent", "immediate action",
];

const AUTHORITY_MARKERS = [
  "irs", "hmrc", "social security", "federal", "police", "law enforcement", "warrant",
  "legal action", "court", "prosecut", "investigation", "compliance", "audit",
  "department of", "officer", "detective", "fraud department",
];

const REASSURANCE_MARKERS = [
  "help you", "happy to help", "assist you", "courtesy call", "no need to worry",
  "just a routine", "technical support", "customer care", "on your behalf",
  "we're here to", "let me walk you through", "verify a few details",
];

const countMatches = (haystack: string, markers: string[]) =>
  markers.reduce((n, marker) => (haystack.includes(marker) ? n + 1 : n), 0);

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Base rate/pitch per delivery, expressed as a deviation from neutral (1/1).
const DELIVERY_SHAPE: Record<CallerDelivery, { rate: number; pitch: number }> = {
  pressuring: { rate: 0.14, pitch: -0.06 },
  authoritative: { rate: -0.05, pitch: -0.18 },
  reassuring: { rate: -0.04, pitch: 0.12 },
  natural: { rate: 0, pitch: 0 },
};

export interface ScenarioVoiceInput {
  id: string;
  sender: string;
  subject?: string;
  body: string;
  difficulty: number;
}

/**
 * Casts the caller from the scenario's own content. Deterministic: the same
 * scenario always produces the same profile.
 */
export function pickCallerVoiceProfile(scenario: ScenarioVoiceInput): CallerVoiceProfile {
  const text = `${scenario.sender} ${scenario.subject ?? ""} ${scenario.body}`.toLowerCase();

  const accent: CallerAccent = countMatches(text, UK_MARKERS) > 0 ? "en-GB" : "en-US";

  // No reliable gender signal in the text, and inventing one from the caller's
  // name would just encode name stereotypes -- so this rides on the scenario id,
  // which keeps it stable per scenario and evenly spread across the pool.
  const gender: CallerGender = hashSeed(scenario.id) % 2 === 0 ? "female" : "male";

  const pressure = countMatches(text, PRESSURE_MARKERS);
  const authority = countMatches(text, AUTHORITY_MARKERS);
  const reassurance = countMatches(text, REASSURANCE_MARKERS);

  let delivery: CallerDelivery = "natural";
  if (pressure > 0 && pressure >= authority && pressure >= reassurance) delivery = "pressuring";
  else if (authority > 0 && authority >= reassurance) delivery = "authoritative";
  else if (reassurance > 0) delivery = "reassuring";

  // The hard scenarios are the ones that don't announce themselves. Pulling the
  // delivery back toward neutral as difficulty rises means a level-5 call sounds
  // like an ordinary conversation and has to be caught on its content, while a
  // level-1 call telegraphs the pressure the lesson just described.
  const clampedDifficulty = Math.min(5, Math.max(1, scenario.difficulty));
  const intensity = 1 - (clampedDifficulty - 1) * 0.15; // 1.0 at difficulty 1 -> 0.4 at 5
  const shape = DELIVERY_SHAPE[delivery];

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    accent,
    gender,
    delivery,
    rate: round(1 + shape.rate * intensity),
    pitch: round(1 + shape.pitch * intensity),
  };
}

/**
 * Resolves the cast profile against the voices this browser actually installed,
 * narrowing from "the exact voice we want" to "any non-novelty English voice".
 */
export function resolveSpeechVoice(
  voices: SpeechSynthesisVoice[],
  profile: CallerVoiceProfile,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const byName = (names: string[]) => {
    for (const name of names) {
      const wanted = name.toLowerCase();
      const match = voices.find((v) => v.name.toLowerCase().includes(wanted));
      if (match) return match;
    }
    return null;
  };

  const langPrefix = profile.accent.toLowerCase();
  const usable = voices.filter((v) => !isNovelty(v));

  return (
    // The voice we actually cast.
    byName(VOICE_NAMES[profile.accent][profile.gender]) ??
    // Right accent, other gender, rather than dropping the accent.
    byName(VOICE_NAMES[profile.accent][profile.gender === "female" ? "male" : "female"]) ??
    // Right gender in the other locale.
    byName(VOICE_NAMES[profile.accent === "en-GB" ? "en-US" : "en-GB"][profile.gender]) ??
    // Nothing we named is installed: any ordinary voice in that locale, ...
    usable.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(langPrefix)) ??
    // ...then any ordinary English voice, ...
    usable.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    // ...and finally whatever is available, novelty or not, over silence.
    usable[0] ??
    voices[0] ??
    null
  );
}
