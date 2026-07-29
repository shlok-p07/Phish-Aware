import { ObjectId } from "mongodb";
import { getCollection } from "../client";

export type OrgRole = "admin" | "manager" | "employee";
export type UserStatus = "invited" | "active" | "disabled";

export interface UserDoc {
  _id: ObjectId;
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
  createdAt: Date;
}

export type InsertUser = Omit<UserDoc, "_id">;

export const USERS_COLLECTION = "users";

export function usersCollection() {
  return getCollection<UserDoc>(USERS_COLLECTION);
}
