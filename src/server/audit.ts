import { ObjectId } from "mongodb";
import { auditLogsCollection, specDefaults, type AuditAction } from "@/db";
import { clientIp } from "@/server/rateLimit";

/**
 * Records a privileged action.
 *
 * Deliberately never throws into its caller. An audit write failing must not
 * turn a successful role change into a 500 -- the action already happened, and
 * reporting failure would tell the admin something untrue. A dropped entry is
 * logged for whoever is watching the process.
 *
 * Called after the action succeeds, so the trail never claims something that did
 * not happen.
 */
export async function recordAudit(input: {
  orgId: ObjectId;
  actorId: ObjectId;
  action: AuditAction;
  targetType: string;
  targetId?: ObjectId | null;
  metadata?: Record<string, unknown>;
  headers?: Headers;
}): Promise<void> {
  try {
    const id = new ObjectId();
    await (await auditLogsCollection()).insertOne({
      _id: id,
      auditLogId: id,
      orgId: input.orgId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ip: input.headers ? clientIp(input.headers) : "",
      ...specDefaults(),
      // After specDefaults, which also supplies an empty metadata -- spreading
      // it later would silently discard the context that makes an entry
      // readable a year from now.
      metadata: input.metadata ?? {},
    });
  } catch (cause) {
    console.warn(`[audit] could not record ${input.action}`, cause);
  }
}
