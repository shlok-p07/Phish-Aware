import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * One submission of the intro survey, kept verbatim.
 *
 * Only the reduced feature vector was ever stored, on the user document, and it
 * was overwritten in place. So the answers that produced somebody's starting
 * level were unrecoverable the moment they retook the survey, and a question
 * whose wording changed made every older score uninterpretable -- there was no
 * record of which form had been filled in.
 *
 * Rows are append-only: a retake adds one rather than replacing the last.
 */
export type SurveyPurpose = "onboarding_baseline" | "periodic_pulse";

export interface SurveyAnswer {
  questionKey: string;
  /** Whatever the question's type yields; the survey definition owns the shape. */
  value: unknown;
}

export interface SurveyResponseDoc extends SpecConventions {
  _id: ObjectId;
  surveyResponseId: ObjectId; // named PK per the shared spec -- mirrors _id
  /** Identifies the questionnaire in code, not a row in a `surveys` collection. */
  surveyKey: string;
  /** Which wording produced these answers. */
  surveyVersion: string;
  purpose: SurveyPurpose;
  userId: ObjectId;
  orgId: ObjectId | null;
  answers: SurveyAnswer[];
  /** The reduced feature vector the model was actually given. */
  derivedSignals: Record<string, unknown>;
  /** The awareness score this submission produced, 0-100. */
  baselineRiskContribution: number;
  completedAt: Date | null;
}

export type InsertSurveyResponse = Omit<SurveyResponseDoc, "_id">;

export const SURVEY_RESPONSES_COLLECTION = "surveyResponses";

export function surveyResponsesCollection() {
  return getCollection<SurveyResponseDoc>(SURVEY_RESPONSES_COLLECTION);
}
