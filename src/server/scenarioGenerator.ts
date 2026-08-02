import { z } from "zod";
import { complete } from "./llm/llmComplete";
import { CUE_LABELS, type CueId } from "./cues";
import {
  ATTACK_TYPE_LABELS,
  PERSUASION_TACTIC_LABELS,
  type AttackTypeId,
  type PersuasionTacticId,
  type PracticeVector,
} from "./attackProfiles";
import type { ScenarioAttachment, ScenarioCue, ScenarioLink } from "@/db";
import { NAME_TOKEN, normalizePlaceholders } from "./personalize";

/**
 * The content an LLM generation produces -- deliberately not the full
 * InsertScenario shape (which also needs scenarioId/orgId/specDefaults()
 * assembled at the actual insert site, same as src/server/seed.ts does for
 * the static seed pool).
 */
export interface GeneratedScenarioContent {
  vector: PracticeVector;
  isPhish: boolean;
  sender: string;
  subject: string;
  body: string;
  links: ScenarioLink[];
  attachments: ScenarioAttachment[];
  cues: ScenarioCue[];
  difficulty: number;
  isOnboarding: false;
}

const CUE_IDS = Object.keys(CUE_LABELS) as CueId[];

// "subject" is optional/blank for sms/voice -- texts and calls don't have one,
// so we don't force the model to invent a fake one for those vectors.
const GeneratedScenarioSchema = z.object({
  sender: z.string().min(1),
  subject: z.string().optional().default(""),
  body: z.string().min(1),
  // Models sometimes omit these keys entirely rather than sending an empty
  // array when a scenario has no links/attachments -- default rather than
  // reject, since that's still perfectly valid content, just a formatting
  // quirk.
  links: z.array(z.object({ text: z.string(), isSuspicious: z.boolean() })).optional().default([]),
  attachments: z
    .array(z.object({ name: z.string(), isSuspicious: z.boolean() }))
    .optional()
    .default([]),
  // No `.min(1)` here -- a legitimate (non-phish) scenario legitimately has
  // zero cues. Whether at least one is *required* depends on isPhish, and
  // that's enforced after parsing (see below), not in the shape itself.
  cues: z
    .array(
      z.object({
        type: z.enum(CUE_IDS as [CueId, ...CueId[]]),
        severity: z.number().min(1).max(5),
        explanation: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
});

export interface GenerateScenarioParams {
  vector: PracticeVector;
  isPhish: boolean;
  department: string | null;
  workType: string | null;
  difficulty: number; // 1-5
  persuasionTactic: PersuasionTacticId;
  attackType: AttackTypeId;
}

/**
 * Two-stage generation, modeled on Yamin et al., "Applications of LLMs for
 * Generating Cyber Security Exercise Scenarios" (IEEE Access, 2024,
 * arnumber=10695083): that paper runs two LLMs in parallel -- one playing a
 * "CISO" who knows the organization and drafts a scenario narrative at high
 * temperature (treating the model's generative/"hallucinatory" reach as a
 * creative asset), the other a "Cyber Security Expert" who refines that
 * draft at lower temperature against explicit realism/technical-soundness
 * criteria. Here that maps onto our actual data need: stage 1 drafts a
 * creative, department-specific pretext; stage 2 refines it for realism and
 * grounds its red flags strictly in this product's own cue vocabulary
 * (CUE_LABELS) so the output is gradeable, not just narratively convincing.
 */
/** Per-vector framing for the draft/refine prompts -- what medium it is, how the model should shape sender/body/links/attachments for it. */
const VECTOR_BRIEF: Record<PracticeVector, { medium: string; shape: string }> = {
  email: {
    medium: "phishing email",
    shape: `{
  "sender": "Display Name <email@domain>",
  "subject": "string",
  "body": "the full email body text",
  "links": [{ "text": "link display text or URL shown", "isSuspicious": true }],
  "attachments": [{ "name": "filename.ext", "isSuspicious": true }]`,
  },
  sms: {
    medium: "smishing (SMS phishing) text message",
    shape: `{
  "sender": "the sender as it would appear on a phone: a raw phone number (e.g. \\"+1 (302) 555-0148\\") or a short alphanumeric sender ID a company might use (e.g. \\"USPS-Alert\\"), never an email address",
  "subject": "",
  "body": "the full text message, written the way a real SMS reads: short (roughly 1-3 sentences), casual, no email-style greeting or signature",
  "links": [{ "text": "a short link as it would appear in a text (e.g. a shortened or lookalike URL)", "isSuspicious": true }],
  "attachments": []`,
  },
  voice: {
    medium: "vishing (voice phishing) phone call transcript",
    shape: `{
  "sender": "the caller ID shown on the phone: either a raw phone number (e.g. \\"+1 (415) 555-0110\\") or a short caller-name label (e.g. \\"Bank Security\\"); never an email address",
  "subject": "",
  "body": "a realistic transcript of ONLY the caller's side of the call, as consecutive \\"Caller: ...\\" lines -- never include a \\"You:\\" line or invent anything said by the recipient. The trainee reacts to this call themselves; scripting their response for them would give away how they're supposed to respond. Keep it concise (roughly 3-6 lines) and make it read like natural spoken dialogue, as if only the scammer's side of the call was captured.",
  "links": [],
  "attachments": []`,
  },
};

// The trainee's real name is deliberately absent from these prompts. Generated
// scenarios land in a pool that is shared across users, so a name baked into
// the stored text would greet the wrong person -- and expose one account's real
// name to another. The model writes a token instead, and the practice route
// substitutes the reader's own name at serve time (see server/personalize.ts).
const NAME_INSTRUCTION = `Addressing the recipient: wherever the message would use the recipient's first name, write exactly ${NAME_TOKEN} instead. For example "Hi ${NAME_TOKEN}," or, on a call, "am I speaking with ${NAME_TOKEN}?". Never invent a first name for the recipient, and never write a bracketed blank such as [Trainee's First Name], [Name], or [Employee] -- ${NAME_TOKEN} is replaced with the real trainee's name before they read it, so anything else will be shown to them verbatim. The one exception: if this message's red flags are meant to include an impersonal greeting, use that generic greeting ("Dear Customer", "Dear User") and no token at all.`;

const VOICE_ALLOWED_CUES: CueId[] = [
  "urgency_language",
  "credential_request",
  "generic_greeting",
];

function buildDraftPrompt(params: GenerateScenarioParams): string {
  const { vector, isPhish, department, workType, difficulty, persuasionTactic, attackType } = params;
  const { medium, shape } = VECTOR_BRIEF[vector];
  const voiceComplexityGuidance =
    vector === "voice"
      ? `Voice-script realism guidance by difficulty:
- 1-2: obvious social-engineering script, blunt pressure, rough phrasing.
- 3: moderately polished and plausible, but still includes noticeable pressure/asks.
- 4-5: highly polished pretext, context-specific details, and subtler pressure that sounds professional at first.`
      : "";

  if (!isPhish) {
    return `You are acting as a real coworker, vendor, or service this organization actually uses, drafting a completely legitimate, benign ${medium} for a security-awareness training simulation. This message must NOT be phishing: no deception, no manufactured urgency, no credential/payment requests, no suspicious links -- nothing a security-aware person should flag.

Organization context:
- Department: ${department ?? "General/unspecified"}
- Work style: ${workType ?? "Unspecified"}
- Loosely themed like: ${ATTACK_TYPE_LABELS[attackType]} -- but write the ordinary, legitimate version of this kind of message (e.g. a real invoice notice, a real IT update, a real coworker note), not an attack.

Draft an ordinary ${medium} that feels specific and realistic for that department and work style, not generic boilerplate -- it should read exactly like real correspondence someone in this role would actually receive.

${NAME_INSTRUCTION}
${vector === "voice" ? `\n${voiceComplexityGuidance}` : ""}

Respond with ONLY a JSON object, no prose:
${shape}
}
Always include the "links" and "attachments" keys as arrays -- use "links": [] and/or "attachments": [] (not omitted) if the scenario doesn't need them. Do not include a "redFlags" key -- this message should have none.`;
  }

  return `You are acting as the CISO of an organization, drafting a realistic ${medium} scenario for a security-awareness training simulation. You know this organization's context well.

Organization context:
- Department targeted: ${department ?? "General/unspecified"}
- Work style: ${workType ?? "Unspecified"}
- Attack type: ${ATTACK_TYPE_LABELS[attackType]}
- Persuasion tactic the attacker leans on: ${PERSUASION_TACTIC_LABELS[persuasionTactic]}
- Target realism level: ${difficulty}/5 (1 = an obviously sloppy attempt, 5 = a highly convincing, well-researched attempt)

Draft a ${medium} that feels specific and targeted to that department and work style, not generic boilerplate. Write it the way a real attacker researching this target would. Be creative and specific about the pretext (project names, vendor names, internal-sounding references) -- inventing plausible-sounding specifics is expected and desired here.

${NAME_INSTRUCTION}
${vector === "voice" ? `\n${voiceComplexityGuidance}` : ""}

Respond with ONLY a JSON object, no prose:
${shape},
  "redFlags": ["plain-language description of a red flag you wrote into this message", "..."]
}
Always include the "links" and "attachments" keys as arrays -- use "links": [] and/or "attachments": [] (not omitted) if the scenario doesn't need them. List at least 2 "redFlags" in your own words -- these get handed to a security expert to formalize, so describe them naturally rather than trying to match any fixed vocabulary.`;
}

function buildRefinePrompt(draftJson: string, params: GenerateScenarioParams): string {
  const { vector, isPhish, difficulty } = params;
  const { medium, shape } = VECTOR_BRIEF[vector];
  const allowedCueIds =
    vector === "voice"
      ? VOICE_ALLOWED_CUES
      : (CUE_IDS as CueId[]).filter((id) => vector !== "sms" || id !== "unexpected_attachment");

  if (!isPhish) {
    return `You are a Cyber Security Expert reviewing a draft, deliberately non-phishing ${medium} scenario for a security-awareness training simulator, written by a colleague. Refine it for realism and internal consistency at the stated difficulty level. Keep the sender/body close to the draft (light polish only), but do NOT introduce any phishing red flags, manufactured urgency, credential/payment requests, or suspicious links -- this message must remain completely legitimate.

Draft from your colleague:
${draftJson}

Target realism level: ${difficulty}/5 (how convincingly ordinary this message reads).

${NAME_INSTRUCTION}

Respond with ONLY a JSON object, no prose, matching this exact shape:
${shape}
}
Always include the "links" and "attachments" keys as arrays -- use "links": [] and/or "attachments": [] (not omitted) if the scenario doesn't need them.`;
  }

  return `You are a Cyber Security Expert reviewing a draft ${medium} scenario for a security-awareness training simulator, written by a colleague. Refine it against these criteria: technical soundness, realism for the stated difficulty, and clarity of detail. Keep the sender/body close to the draft (light polish only, fix anything technically implausible), but do NOT invent a different scenario.

Draft from your colleague:
${draftJson}

Target realism level: ${difficulty}/5 (1 = obvious red flags, 5 = highly convincing, minimal tells).

${NAME_INSTRUCTION}

Your job: reformalize the draft's "redFlags" into graded, gradeable cues using ONLY this exact vocabulary of cue "type" ids (do not invent new ones, and only include ones that genuinely apply to this message): ${allowedCueIds.map((id) => `${id} (${CUE_LABELS[id]})`).join(", ")}.

Respond with ONLY a JSON object, no prose, matching this exact shape:
${shape},
  "cues": [{ "type": "cue_id_from_the_vocabulary_above", "severity": 1-5, "explanation": "why this is a red flag" }]
}
Always include the "links" and "attachments" keys as arrays -- use "links": [] and/or "attachments": [] (not omitted) if the scenario doesn't need them. Include at least 2 cues.`;
}

async function callJson(systemPrompt: string, userPrompt: string, temperature: number): Promise<unknown | null> {
  const raw = await complete({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature,
    json: true,
  });
  if (!raw) return null;
  return JSON.parse(raw);
}

const SIMULATOR_DISCLAIMER =
  "You write content exclusively for an authorized security-awareness training simulator. Nothing you generate is sent anywhere or targets a real person -- it's shown to the trainee as a judgment exercise. Respond with strict JSON only, no markdown fences, no commentary.";

/**
 * Adaptive scenario generator: drafts a scenario (CISO-style,
 * creative/high-temperature) then refines it (Cyber Security Expert style,
 * lower-temperature) into a graded, schema-valid scenario. Each stage is
 * itself resilient across two LLM providers -- see llm/llmComplete.ts --
 * so a single provider's rate limit doesn't take generation down. Returns
 * null if both providers are unconfigured/fail, or either stage produces
 * invalid output -- callers should fall back to the static seed pool
 * (src/server/seedScenarios.ts) rather than blocking practice on this.
 */
export async function generatePhishingScenario(
  params: GenerateScenarioParams,
): Promise<GeneratedScenarioContent | null> {
  try {
    const draft = await callJson(
      `You act as a CISO drafting ${params.isPhish ? "a phishing-email pretext" : "a legitimate, benign organizational message"} for a security-awareness training simulator. ${SIMULATOR_DISCLAIMER}`,
      buildDraftPrompt(params),
      1.0,
    );
    if (!draft) return null;

    const refined = await callJson(
      `You act as a Cyber Security Expert refining a colleague's draft into gradeable training content. ${SIMULATOR_DISCLAIMER}`,
      buildRefinePrompt(JSON.stringify(draft), params),
      0.4,
    );
    if (!refined) return null;

    const parsed = GeneratedScenarioSchema.parse(refined);

    // A legitimate scenario has no red flags to grade, full stop -- force
    // that regardless of what the model returned, the same way vector/
    // isPhish themselves are forced rather than trusted from the prompt.
    const cues = params.isPhish
      ? parsed.cues.filter((c) => {
          if (params.vector === "sms") return c.type !== "unexpected_attachment";
          if (params.vector === "voice") return VOICE_ALLOWED_CUES.includes(c.type);
          return true;
        })
      : [];
    if (params.isPhish && cues.length === 0) {
      console.error("[scenarioGenerator] refine stage returned no valid cues for a phishing scenario");
      return null;
    }

    return {
      vector: params.vector,
      isPhish: params.isPhish,
      // A model that ignored the token instruction and left its own blank
      // ("Hey [Trainee's First Name],") gets it rewritten to the canonical
      // token here, so the serve-time substitution still personalizes it
      // instead of shipping raw brackets to the learner.
      sender: normalizePlaceholders(parsed.sender),
      subject: normalizePlaceholders(parsed.subject),
      body: normalizePlaceholders(parsed.body),
      // Voice scenarios are transcript-only in this simulator: no clickable
      // links or attachments in the call pane.
      links: params.vector === "voice" ? [] : parsed.links,
      // SMS/voice can't carry file attachments in this simulator regardless of
      // what the model returned -- enforce that rather than trust the prompt.
      attachments: params.vector === "email" ? parsed.attachments : [],
      cues,
      difficulty: params.difficulty,
      isOnboarding: false,
    };
  } catch (err) {
    console.error("[scenarioGenerator] generation failed, caller should fall back:", err);
    return null;
  }
}
