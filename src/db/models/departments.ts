import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * A department belonging to one organization.
 *
 * The collection was provisioned from the start and never used: the app carried
 * a `department` string on the user, drawn from a fixed list of ten, so every
 * customer got the same ten and none could add their own. `parentId` and
 * `managerId` are part of the shared schema and are stored here; nothing reads
 * them yet, so a hierarchy can be layered on without another migration.
 *
 * The denormalized `users.department` name remains the read path -- the scenario
 * generator and the attack-profile selector both key off it on every practice
 * request, and joining for that would be a lookup per round. `users.departmentId`
 * points here so a rename can be resolved to the same department later.
 */
export interface DepartmentDoc extends SpecConventions {
  _id: ObjectId;
  departmentId: ObjectId; // named PK per the shared spec -- mirrors _id
  orgId: ObjectId;
  name: string;
  parentId: ObjectId | null;
  managerId: ObjectId | null;
}

export type InsertDepartment = Omit<DepartmentDoc, "_id">;

export const DEPARTMENTS_COLLECTION = "departments";

export function departmentsCollection() {
  return getCollection<DepartmentDoc>(DEPARTMENTS_COLLECTION);
}
