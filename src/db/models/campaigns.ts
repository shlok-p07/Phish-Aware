import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

export type CampaignType = "training" | "mandatory" | "surprise_test";
export type CampaignStatus = "draft" | "scheduled" | "active" | "completed";

export interface CampaignDoc extends SpecConventions {
  _id: ObjectId;
  campaignId: ObjectId; // named PK per the shared spec -- mirrors _id
  orgId: ObjectId;
  type: CampaignType;
  name: string;
  scenarioIds: ObjectId[];
  lessonIds: ObjectId[];
  audience: Record<string, unknown>; // spec's generic audience object -- unused by this app so far
  dueDate: Date | null;
  status: CampaignStatus;
  createdBy: ObjectId;
  // Who this training targets: "all" org members, or a single member's user
  // id (hex string). App-specific, spec-unlisted -- kept as a simple field
  // since it maps 1:1 to the admin UI's target selector (the spec's generic
  // `audience` object above is populated too, but not consumed by this app).
  target: string;
  requiredScenarios: number;
}

export type InsertCampaign = Omit<CampaignDoc, "_id">;

export const CAMPAIGNS_COLLECTION = "campaigns";

export function campaignsCollection() {
  return getCollection<CampaignDoc>(CAMPAIGNS_COLLECTION);
}
