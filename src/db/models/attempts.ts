import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";
import type { CueId } from "@/server/cues";

export type Verdict = "phish" | "legit";

export interface AttemptDoc extends SpecConventions {
  _id: ObjectId;
  attemptId: ObjectId; // named PK per the shared spec -- mirrors _id
  userId: ObjectId;
  orgId: ObjectId | null;
  scenarioId: ObjectId;
  campaignId: ObjectId | null;
  verdict: Verdict;
  selectedCues: CueId[];
  confidence: number;
  correct: boolean;
  missedCues: CueId[];
  falseCues: CueId[];
  caughtCues: CueId[];
  explanation: string;
  calibrationNote: string;
  xpAwarded: number;
}

export type InsertAttempt = Omit<AttemptDoc, "_id">;

export const ATTEMPTS_COLLECTION = "attempts";

export function attemptsCollection() {
  return getCollection<AttemptDoc>(ATTEMPTS_COLLECTION);
}
