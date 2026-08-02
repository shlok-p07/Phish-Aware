import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";
import type { CueId } from "@/server/cues";

export interface ScenarioLink {
  text: string;
  isSuspicious: boolean;
}

export interface ScenarioAttachment {
  name: string;
  isSuspicious: boolean;
}

export interface ScenarioCue {
  type: CueId;
  severity: number;
  explanation: string;
}

export interface ScenarioDoc extends SpecConventions {
  _id: ObjectId;
  scenarioId: ObjectId; // named PK per the shared spec -- mirrors _id
  orgId: ObjectId | null;
  vector: string;
  isPhish: boolean;
  sender: string;
  subject: string;
  body: string;
  links: ScenarioLink[];
  attachments: ScenarioAttachment[];
  cues: ScenarioCue[];
  difficulty: number; // 1-5, per the shared spec
  isOnboarding: boolean; // app-specific, spec-unlisted -- see 01-validators.js header
  // Matches the shared schema's `source` enum (01-validators.js) -- lets the
  // practice-pool logic (src/server/scenarioPool.ts) tell live-generated
  // scenarios apart from the static library ones without a new field.
  source: "library" | "ai_generated";
}

// orgId defaults to null (global library scenario) when omitted by callers.
export type InsertScenario = Omit<ScenarioDoc, "_id" | "orgId"> & { orgId?: ObjectId | null };

export const SCENARIOS_COLLECTION = "scenarios";

export function scenariosCollection() {
  return getCollection<ScenarioDoc>(SCENARIOS_COLLECTION);
}
