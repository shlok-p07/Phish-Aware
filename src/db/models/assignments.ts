import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

export type AssignmentStatus = "assigned" | "in_progress" | "completed" | "overdue";

export interface AssignmentDoc extends SpecConventions {
  _id: ObjectId;
  assignmentId: ObjectId; // named PK per the shared spec -- mirrors _id
  campaignId: ObjectId;
  userId: ObjectId;
  orgId: ObjectId;
  status: AssignmentStatus;
  progress: number;
  completedAt: Date | null;
}

export type InsertAssignment = Omit<AssignmentDoc, "_id">;

export const ASSIGNMENTS_COLLECTION = "assignments";

export function assignmentsCollection() {
  return getCollection<AssignmentDoc>(ASSIGNMENTS_COLLECTION);
}
