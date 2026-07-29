import { ObjectId } from "mongodb";
import { getCollection } from "../client";

export type CampaignType = "training" | "mandatory" | "surprise_test";
export type CampaignStatus = "draft" | "scheduled" | "active" | "completed";

export interface CampaignDoc {
  _id: ObjectId;
  orgId: ObjectId;
  type: CampaignType;
  name: string;
  scenarioIds: ObjectId[];
  lessonIds: ObjectId[];
  dueDate: Date | null;
  status: CampaignStatus;
  createdBy: ObjectId;
  // Who this training targets: "all" org members, or a single member's user
  // id (hex string). Not part of the shared Mongo schema (which models this
  // via a generic `audience` object) -- kept as a simple app-level field
  // since it maps 1:1 to the admin UI's target selector.
  target: string;
  requiredScenarios: number;
  createdAt: Date;
}

export type InsertCampaign = Omit<CampaignDoc, "_id">;

export const CAMPAIGNS_COLLECTION = "campaigns";

export function campaignsCollection() {
  return getCollection<CampaignDoc>(CAMPAIGNS_COLLECTION);
}
