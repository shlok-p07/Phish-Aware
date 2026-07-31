import { z } from "zod";
import { getGroqClient, GROQ_MODEL } from "./llm/groqClient";
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
  links: z.array(z.object({ text: z.string(), isSuspicious: z.boolean() })),
  attachments: z.array(z.object({ name: z.string(), isSuspicious: z.boolean() })),
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

function buildPrompt(params: GenerateScenarioParams): string {
  const { department, workType, difficulty, persuasionTactic, attackType } = params;
  return `Generate a realistic phishing email for a security-awareness training simulation with these metrics:

Department: ${department ?? "General/unspecified"}
Work Type: ${workType ?? "Unspecified"}
Phishing Type: Email
Persuasion Tactic: ${PERSUASION_TACTIC_LABELS[persuasionTactic]}
Attack Type: ${ATTACK_TYPE_LABELS[attackType]}
Difficulty: ${difficulty}/5 (1 = obvious red flags, 5 = highly convincing, minimal tells)

Make it feel targeted and specific to that department and work style, not generic. Write it the way a real attacker would: a believable sender name/address, a subject line that would actually get opened, and a body that leans on the given persuasion tactic and attack type.

Embed real, gradeable red-flag cues from this exact vocabulary (use the "type" ids verbatim): ${CUE_IDS.map((id) => `${id} (${CUE_LABELS[id]})`).join(", ")}.

Respond with ONLY a JSON object, no prose, matching this exact shape:
{
  "sender": "Display Name <email@domain>",
  "subject": "string",
  "body": "the full email body text",
  "links": [{ "text": "link display text or URL shown", "isSuspicious": true }],
  "attachments": [{ "name": "filename.ext", "isSuspicious": true }],
  "cues": [{ "type": "cue_id_from_the_vocabulary_above", "severity": 1-5, "explanation": "why this is a red flag" }]
}
Omit "links"/"attachments" (empty arrays) if the scenario doesn't need them. Include at least 2 cues.`;
}

/**
 * Phase 1 of the adaptive scenario generator: builds one LLM-generated
 * phishing email scenario via Groq. Returns null if GROQ_API_KEY isn't
 * configured or generation/validation fails -- callers should fall back to
 * the static seed pool (src/server/seedScenarios.ts) rather than blocking
 * practice on this.
 */
export async function generatePhishingScenario(
  params: GenerateScenarioParams,
): Promise<GeneratedScenarioContent | null> {
  const client = getGroqClient();
  if (!client) return null;

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You write realistic phishing-email content exclusively for an authorized security-awareness training simulator. Nothing you generate is sent anywhere or targets a real person -- it's shown to the trainee as a judgment exercise. Respond with strict JSON only, no markdown fences, no commentary.",
        },
        { role: "user", content: buildPrompt(params) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.9,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = GeneratedScenarioSchema.parse(JSON.parse(raw));

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
    console.error("[scenarioGenerator] Groq generation failed, caller should fall back:", err);
    return null;
  }
}
