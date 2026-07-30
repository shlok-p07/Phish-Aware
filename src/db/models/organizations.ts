import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

export interface OrganizationDoc extends SpecConventions {
  _id: ObjectId;
  orgId: ObjectId; // named PK per the shared spec -- mirrors _id
  name: string;
  domain: string | null;
  ssoProvider: string | null;
  settings: { seatLimit: number };
}

export type InsertOrganization = Omit<OrganizationDoc, "_id">;

export const ORGANIZATIONS_COLLECTION = "organizations";

export function organizationsCollection() {
  return getCollection<OrganizationDoc>(ORGANIZATIONS_COLLECTION);
}
