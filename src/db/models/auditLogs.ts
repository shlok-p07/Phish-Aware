import { ObjectId } from "mongodb";
import { getCollection } from "../client";
import type { SpecConventions } from "./specConventions";

/**
 * A record of privileged actions taken inside one organization.
 *
 * The collection was provisioned from the start and never written to, so an
 * organization had no way to answer who changed a role, moved somebody between
 * departments, removed a member, or issued a password reset code -- the last of
 * which hands over the ability to sign in as somebody else. For a product whose
 * whole subject is accountability, that gap is hard to defend.
 */
export type AuditAction =
  | "member.invited"
  | "member.role_changed"
  | "member.department_changed"
  | "member.removed"
  | "member.reset_code_issued"
  | "department.created"
  | "department.renamed"
  | "department.deleted"
  | "training.created"
  | "training.deleted"
  | "org.settings_updated"
  | "org.sso_updated";

export interface AuditLogDoc extends SpecConventions {
  _id: ObjectId;
  auditLogId: ObjectId; // named PK per the shared spec -- mirrors _id
  orgId: ObjectId;
  actorId: ObjectId;
  action: AuditAction;
  targetType: string;
  targetId: ObjectId | null;
  /**
   * Enough context to read the entry a year later, and never anything sensitive.
   * A reset-code entry records that a code was issued, never the code.
   */
  metadata: Record<string, unknown>;
  ip: string;
}

export type InsertAuditLog = Omit<AuditLogDoc, "_id">;

export const AUDIT_LOGS_COLLECTION = "auditLogs";

export function auditLogsCollection() {
  return getCollection<AuditLogDoc>(AUDIT_LOGS_COLLECTION);
}
