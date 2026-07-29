import { ObjectId } from "mongodb";
import { getCollection } from "../client";

export type AssignmentStatus = "assigned" | "in_progress" | "completed" | "overdue";

export interface AssignmentDoc {
  _id: ObjectId;
  campaignId: ObjectId;
  userId: ObjectId;
  orgId: ObjectId;
  status: AssignmentStatus;
  progress: number;
  completedAt: Date | null;
  createdAt: Date;
}

export type InsertAssignment = Omit<AssignmentDoc, "_id">;

export const ASSIGNMENTS_COLLECTION = "assignments";

export function assignmentsCollection() {
  return getCollection<AssignmentDoc>(ASSIGNMENTS_COLLECTION);
}
