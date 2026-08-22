import type { ObjectId } from "mongodb";
import { organizationsCollection } from "@/db";
import { DEFAULT_WORKSPACE, readWorkspace, type OrgWorkspace } from "./orgBranding";

/**
 * The workspace customisation that applies to one member.
 *
 * Null for a learner with no organisation -- a self-signup user has nobody to
 * inherit branding from, and returning defaults would be indistinguishable from
 * an organisation that had deliberately customised nothing.
 *
 * Never throws. Branding is decoration plus a reporting address; if this read
 * fails, the caller should still get their dashboard.
 */
export async function workspaceForMember(orgId: ObjectId | null): Promise<OrgWorkspace | null> {
  if (!orgId) return null;
  try {
    const orgs = await organizationsCollection();
    const org = await orgs.findOne({ _id: orgId }, { projection: { settings: 1, name: 1 } });
    if (!org) return null;
    return readWorkspace(org.settings, org.name ?? null);
  } catch (cause) {
    console.error("[workspace] could not read org customisation", cause);
    return DEFAULT_WORKSPACE;
  }
}
