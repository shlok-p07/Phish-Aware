import { ObjectId } from "mongodb";
import { getCollection } from "../client";

export interface OrganizationDoc {
  _id: ObjectId;
  name: string;
  domain: string | null;
  ssoProvider: string | null;
  settings: { seatLimit: number };
  createdAt: Date;
}

export type InsertOrganization = Omit<OrganizationDoc, "_id">;

export const ORGANIZATIONS_COLLECTION = "organizations";

export function organizationsCollection() {
  return getCollection<OrganizationDoc>(ORGANIZATIONS_COLLECTION);
}
