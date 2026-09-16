/**
 * Vocabulary for the adaptive scenario generator (see project's AI-pipeline
 * spec). Persuasion tactics reuse the shared spec's `emotionalLevers` enum,
 * extended from 6 to 8 values to match the product spec exactly (see
 * phishaware-db/init/01-validators.js's LEVER const, kept in lockstep).
 */
import { isDepartment, type Department } from "@/lib/onboarding-survey";

export type PersuasionTacticId =
  | "urgency"
  | "authority"
  | "fear"
  | "trust"
  | "curiosity"
  | "reward"
  | "scarcity"
  | "social_proof";

export const PERSUASION_TACTIC_LABELS: Record<PersuasionTacticId, string> = {
  urgency: "Urgency",
  authority: "Authority",
  fear: "Fear",
  trust: "Trust/Familiarity",
  curiosity: "Curiosity",
  reward: "Reward",
  scarcity: "Scarcity",
  social_proof: "Social Proof",
};

export const PERSUASION_TACTICS = Object.keys(
  PERSUASION_TACTIC_LABELS,
) as PersuasionTacticId[];

export type AttackTypeId =
  | "credential_harvesting"
  | "bec"
  | "invoice_fraud"
  | "payroll_fraud"
  | "mfa_fatigue"
  | "cloud_file_sharing_scam"
  | "it_helpdesk_scam"
  | "package_delivery_scam"
  | "software_update_scam"
  | "malware_delivery";

export const ATTACK_TYPE_LABELS: Record<AttackTypeId, string> = {
  credential_harvesting: "Credential Harvesting",
  bec: "Business Email Compromise (BEC)",
  invoice_fraud: "Invoice / Payment Fraud",
  payroll_fraud: "Payroll / HR Fraud",
  mfa_fatigue: "MFA Fatigue / Authentication Abuse",
  cloud_file_sharing_scam: "Cloud File Sharing Scam",
  it_helpdesk_scam: "IT Support / Help Desk Scam",
  package_delivery_scam: "Package Delivery / Logistics Scam",
  software_update_scam: "Software / Account Update Scam",
  malware_delivery: "Malware Delivery",
};

/** Attack types applicable to every department, per the product spec. */
const UNIVERSAL_ATTACK_TYPES: AttackTypeId[] = [
  "credential_harvesting",
  "mfa_fatigue",
  "it_helpdesk_scam",
  "package_delivery_scam",
  "malware_delivery",
];

/**
 * Department -> eligible attack types, layered on top of the universal set.
 * Keys are exactly DEPARTMENTS from the onboarding survey
 * (src/lib/onboarding-survey.ts) -- a test enforces that.
 *
 * The spec's "Office workers"/"IT-heavy organizations" phrasing doesn't map
 * 1:1 onto that list, so the desk-bound departments stand in for "Office
 * workers" (cloud file sharing) and IT gets the software/account update scam
 * the spec scoped to "IT-heavy organizations". Anything unmapped, including a
 * user who never told us, falls back to the universal set.
 */
export const DEPARTMENT_ATTACK_TYPES: Record<Department, AttackTypeId[]> = {
  "Customer Support": [...UNIVERSAL_ATTACK_TYPES, "cloud_file_sharing_scam"],
  Engineering: [...UNIVERSAL_ATTACK_TYPES, "cloud_file_sharing_scam"],
  Executive: [...UNIVERSAL_ATTACK_TYPES, "bec", "invoice_fraud"],
  Finance: [...UNIVERSAL_ATTACK_TYPES, "bec", "invoice_fraud"],
  HR: [...UNIVERSAL_ATTACK_TYPES, "bec", "payroll_fraud"],
  IT: [...UNIVERSAL_ATTACK_TYPES, "software_update_scam"],
  Legal: [...UNIVERSAL_ATTACK_TYPES, "bec", "cloud_file_sharing_scam"],
  Marketing: [...UNIVERSAL_ATTACK_TYPES, "cloud_file_sharing_scam"],
  Operations: [...UNIVERSAL_ATTACK_TYPES, "cloud_file_sharing_scam", "payroll_fraud"],
  Sales: [...UNIVERSAL_ATTACK_TYPES, "bec", "invoice_fraud"],
};

export function eligibleAttackTypes(department: string | null): AttackTypeId[] {
  if (!isDepartment(department)) return UNIVERSAL_ATTACK_TYPES;
  return DEPARTMENT_ATTACK_TYPES[department];
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Vectors the adaptive generator currently knows how to write. */
export const PRACTICE_VECTORS = ["email", "sms", "voice", "qr", "social", "web"] as const;
export type PracticeVector = (typeof PRACTICE_VECTORS)[number];

/** What the learner asked to practice: a specific vector, or "mixed" for the previous random-every-round behavior. */
export type VectorPreference = PracticeVector | "mixed";

/** Picks which vector this round's scenario will be. An explicit preference is honored as-is; "mixed" (or omitted) keeps the original random draw. */
export function pickVector(preference?: VectorPreference): PracticeVector {
  // Checked against the list rather than an inline || chain: the chain silently
  // fell out of date when qr was added, so asking to practise QR codes quietly
  // randomised instead, and the same would have happened to every vector added
  // after it.
  if (preference && preference !== "mixed" && PRACTICE_VECTORS.includes(preference)) {
    return preference;
  }
  return pickRandom(PRACTICE_VECTORS);
}

/**
 * An even draw. It used to be two-in-three phishing, matching the static seed
 * pool -- which meant a learner who answered "phishing" every round scored about
 * 62% without exercising any judgement, and the stream read as relentlessly
 * hostile rather than like a real inbox to be sorted.
 *
 * Real mail is mostly legitimate, so this is not realism; it is measurement. An
 * even draw is the only ratio where accuracy means what it appears to mean.
 * Selection also balances the recent mix (see scenarioFit's imbalance weight),
 * so what a learner actually sees converges on even regardless of what the pool
 * happens to hold.
 */
const PHISH_WEIGHTED_DRAW = [true, false] as const;

/** Picks whether this round's live-generated scenario should be a phish or a legitimate message. */
export function pickIsPhish(): boolean {
  return pickRandom(PHISH_WEIGHTED_DRAW);
}

/**
 * Phase 1 (current): new users have no interaction history yet, so pick a
 * persuasion tactic and an attack type at random, with the attack type
 * constrained to what's realistic for the user's department.
 * TODO Phase 2: replace the random picks with a 70/30 weighted
 * explore/exploit choice over each user's per-tactic/attack-type accuracy
 * history once enough attempts exist to compute it.
 */
export function pickAttackProfile(department: string | null): {
  persuasionTactic: PersuasionTacticId;
  attackType: AttackTypeId;
} {
  return {
    persuasionTactic: pickRandom(PERSUASION_TACTICS),
    attackType: pickRandom(eligibleAttackTypes(department)),
  };
}

/** Maps a 0-1 phishing awareness score to the 1-5 difficulty scale ScenarioDoc uses. */
export function difficultyForAwarenessScore(score: number): number {
  if (score >= 0.85) return 5;
  if (score >= 0.65) return 4;
  if (score >= 0.4) return 3;
  if (score >= 0.2) return 2;
  return 1;
}
