import { ObjectId } from "mongodb";
import { notificationsCollection, specDefaults, type NotificationType } from "@/db";

/**
 * Writing notifications, and the one rule that makes them bearable.
 *
 * Every notification is tied to a subject, and one is written per (user, type,
 * subject) at most. Without that, a reminder sweep that runs on every request --
 * which is how this app does background work, since there is no scheduler --
 * would stack up a fresh copy every time somebody loaded a page, and the feature
 * would be worse than silence.
 */
export async function notifyOnce(input: {
  userId: ObjectId;
  orgId: ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  subjectId: ObjectId;
}): Promise<boolean> {
  try {
    const notifications = await notificationsCollection();
    const existing = await notifications.findOne({
      userId: input.userId,
      type: input.type,
      subjectId: input.subjectId,
    });
    if (existing) {
      return false;
    }
    const id = new ObjectId();
    await notifications.insertOne({
      _id: id,
      notificationId: id,
      userId: input.userId,
      orgId: input.orgId,
      type: input.type,
      title: input.title,
      body: input.body,
      channel: "in_app",
      read: false,
      sentAt: new Date(),
      subjectId: input.subjectId,
      ...specDefaults(),
    });
    return true;
  } catch (cause) {
    // Never throw into the caller: a notification is a courtesy attached to some
    // other action that has already succeeded.
    console.warn(`[notify] could not write ${input.type}`, cause);
    return false;
  }
}

/** Wording for an assignment, kept here so the two callers cannot drift. */
export function assignmentNotification(title: string, dueDate: Date | null) {
  return {
    title: "Training assigned to you",
    body: dueDate
      ? `${title}. Due ${dueDate.toISOString().slice(0, 10)}.`
      : `${title}. No deadline set.`,
  };
}

export function dueSoonNotification(title: string, dueDate: Date) {
  return {
    title: "Training due soon",
    body: `${title}. Due ${dueDate.toISOString().slice(0, 10)} and not finished yet.`,
  };
}

export function overdueNotification(title: string, dueDate: Date) {
  return {
    title: "Training overdue",
    body: `${title}. The deadline was ${dueDate.toISOString().slice(0, 10)}.`,
  };
}
