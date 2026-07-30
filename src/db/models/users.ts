import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

export type OrgRole = "admin" | "manager" | "employee";
export type UserStatus = "invited" | "active" | "disabled";

export interface UserDoc extends SpecConventions {
  _id: ObjectId;
  userId: ObjectId; // named PK per the shared spec -- mirrors _id
  orgId: ObjectId | null;
  name: string;
  email: string | null;
  passwordHash: string | null;
  isGuest: boolean;
  level: string;
  xp: number;
  streak: number;
  lastActiveDate: string | null;
  badges: string[];
  calibrationScore: number;
  onboardingCompleted: boolean;
  role: OrgRole;
  status: UserStatus;
}

export type InsertUser = Omit<UserDoc, "_id">;

export const USERS_COLLECTION = "users";

export function usersCollection() {
  return getCollection<UserDoc>(USERS_COLLECTION);
}
