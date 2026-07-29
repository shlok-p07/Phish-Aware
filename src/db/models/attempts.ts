import { ObjectId } from "mongodb";
import { getCollection } from "../client";

export interface AttemptDoc {
  _id: ObjectId;
  userId: ObjectId;
  orgId: ObjectId | null;
  scenarioId: ObjectId;
  userVerdict: boolean;
  selectedCues: string[];
  confidence: number;
  correct: boolean;
  missedCues: string[];
  falseCues: string[];
  caughtCues: string[];
  explanation: string;
  calibrationNote: string;
  xpAwarded: number;
  createdAt: Date;
}

export type InsertAttempt = Omit<AttemptDoc, "_id">;

export const ATTEMPTS_COLLECTION = "attempts";

export function attemptsCollection() {
  return getCollection<AttemptDoc>(ATTEMPTS_COLLECTION);
}
