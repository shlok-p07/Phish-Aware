import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * Something the app needs to tell one person.
 *
 * Provisioned from the start and never used, which is why a mandatory campaign
 * could be assigned, sit past its deadline and lapse in complete silence -- the
 * employee only found out if they happened to open their dashboard. A training
 * product nobody is told about is a training product nobody does.
 *
 * `channel` allows for email, but nothing here sends any: delivery is an
 * operator's decision (see src/server/codeDelivery.ts for the same reasoning),
 * so everything written is in_app and read where the user already is.
 */
export type NotificationType = "assignment" | "reminder" | "result" | "system" | "survey";

export interface NotificationDoc extends SpecConventions {
  _id: ObjectId;
  notificationId: ObjectId; // named PK per the shared spec -- mirrors _id
  userId: ObjectId;
  orgId: ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  channel: "in_app" | "email";
  read: boolean;
  sentAt: Date | null;
  /**
   * What this is about, so a notification can be deduplicated and so clicking it
   * can lead somewhere. Null for anything not tied to a record.
   */
  subjectId: ObjectId | null;
}

export type InsertNotification = Omit<NotificationDoc, "_id">;

export const NOTIFICATIONS_COLLECTION = "notifications";

export function notificationsCollection() {
  return getCollection<NotificationDoc>(NOTIFICATIONS_COLLECTION);
}
