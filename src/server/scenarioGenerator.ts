import { z } from "zod";
import { complete } from "./llm/llmComplete";
import { CUE_LABELS, type CueId } from "./cues";
import {
  ATTACK_TYPE_LABELS,
  PERSUASION_TACTIC_LABELS,
  type AttackTypeId,
  type PersuasionTacticId,
} from "./attackProfiles";
import type { ScenarioAttachment, ScenarioCue, ScenarioLink } from "@/db";

/**
 * The content an LLM generation produces -- deliberately not the full
 * InsertScenario shape (which also needs scenarioId/orgId/specDefaults()
 * assembled at the actual insert site, same as src/server/seed.ts does for
 * the static seed pool).
 */
export interface GeneratedScenarioContent {
  vector: "email";
  isPhish: true;
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

const GeneratedScenarioSchema = z.object({
  sender: z.string().min(1),
  subject: z.string().min(1),
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
  cues: z
    .array(
      z.object({
        type: z.enum(CUE_IDS as [CueId, ...CueId[]]),
        severity: z.number().min(1).max(5),
        explanation: z.string().min(1),
      }),
    )
    .min(1),
});

export interface GenerateScenarioParams {
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
function buildDraftPrompt(params: GenerateScenarioParams): string {
  const { department, workType, difficulty, persuasionTactic, attackType } = params;
  return `You are acting as the CISO of an organization, drafting a realistic phishing email scenario for a security-awareness training simulation. You know this organization's context well.

Organization context:
- Department targeted: ${department ?? "General/unspecified"}
- Work style: ${workType ?? "Unspecified"}
- Attack type: ${ATTACK_TYPE_LABELS[attackType]}
- Persuasion tactic the attacker leans on: ${PERSUASION_TACTIC_LABELS[persuasionTactic]}
- Target realism level: ${difficulty}/5 (1 = an obviously sloppy attempt, 5 = a highly convincing, well-researched attempt)

Draft a phishing email that feels specific and targeted to that department and work style, not generic boilerplate. Write it the way a real attacker researching this target would. Be creative and specific about the pretext (project names, vendor names, internal-sounding references) -- inventing plausible-sounding specifics is expected and desired here.

Respond with ONLY a JSON object, no prose:
{
  "sender": "Display Name <email@domain>",
  "subject": "string",
  "body": "the full email body text",
  "links": [{ "text": "link display text or URL shown", "isSuspicious": true }],
  "attachments": [{ "name": "filename.ext", "isSuspicious": true }],
  "redFlags": ["plain-language description of a red flag you wrote into this email", "..."]
}
Always include the "links" and "attachments" keys as arrays -- use "links": [] and/or "attachments": [] (not omitted) if the scenario doesn't need them. List at least 2 "redFlags" in your own words -- these get handed to a security expert to formalize, so describe them naturally rather than trying to match any fixed vocabulary.`;
}

function buildRefinePrompt(draftJson: string, params: GenerateScenarioParams): string {
  const { difficulty } = params;
  return `You are a Cyber Security Expert reviewing a draft phishing-email scenario for a security-awareness training simulator, written by a colleague. Refine it against these criteria: technical soundness, realism for the stated difficulty, and clarity of detail. Keep the sender/subject/body close to the draft (light polish only, fix anything technically implausible), but do NOT invent a different scenario.

Draft from your colleague:
${draftJson}

Target realism level: ${difficulty}/5 (1 = obvious red flags, 5 = highly convincing, minimal tells).

Your job: reformalize the draft's "redFlags" into graded, gradeable cues using ONLY this exact vocabulary of cue "type" ids (do not invent new ones, and only include ones that genuinely apply to this email): ${CUE_IDS.map((id) => `${id} (${CUE_LABELS[id]})`).join(", ")}.

Respond with ONLY a JSON object, no prose, matching this exact shape:
{
  "sender": "Display Name <email@domain>",
  "subject": "string",
  "body": "the full email body text",
  "links": [{ "text": "link display text or URL shown", "isSuspicious": true }],
  "attachments": [{ "name": "filename.ext", "isSuspicious": true }],
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
      `You act as a CISO drafting a phishing-email pretext. ${SIMULATOR_DISCLAIMER}`,
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

    return {
      vector: "email",
      isPhish: true,
      sender: parsed.sender,
      subject: parsed.subject,
      body: parsed.body,
      links: parsed.links,
      attachments: parsed.attachments,
      cues: parsed.cues,
      difficulty: params.difficulty,
      isOnboarding: false,
    };
  } catch (err) {
    console.error("[scenarioGenerator] generation failed, caller should fall back:", err);
    return null;
  }
}
