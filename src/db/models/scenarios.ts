import { ObjectId } from "mongodb";
import { getCollection } from "../client";

export interface ScenarioCue {
  label: string; // CueId
  severity: "low" | "medium" | "high";
  explanation: string;
}

export interface ScenarioDoc {
  _id: ObjectId;
  orgId: ObjectId | null;
  vector: string;
  isPhish: boolean;
  sender: string;
  subject: string;
  body: string;
  links: string[];
  attachmentName: string | null;
  cues: ScenarioCue[];
  difficulty: string;
  isOnboarding: boolean;
}

// orgId defaults to null (global library scenario) when omitted by callers.
export type InsertScenario = Omit<ScenarioDoc, "_id" | "orgId"> & { orgId?: ObjectId | null };

export const SCENARIOS_COLLECTION = "scenarios";

export function scenariosCollection() {
  return getCollection<ScenarioDoc>(SCENARIOS_COLLECTION);
}
