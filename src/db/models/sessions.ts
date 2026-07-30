import { ObjectId } from "mongodb";
import { getCollection } from "../client";

export interface SessionDoc {
  _id: ObjectId;
  token: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export type InsertSession = Omit<SessionDoc, "_id">;

export const SESSIONS_COLLECTION = "sessions";

export function sessionsCollection() {
  return getCollection<SessionDoc>(SESSIONS_COLLECTION);
}
