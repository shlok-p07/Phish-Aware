import { ObjectId } from "mongodb";
import { assignmentsCollection, campaignsCollection, type CampaignFocus } from "@/db";

/**
 * The focus of this member's most demanding open assignment, if any.
 *
 * Practice used to ignore assignments entirely: an admin could require training
 * on lookalike domains and the engine would keep serving whatever the pool
 * offered, so meeting the requirement was luck. This is what connects the two.
 *
 * "Most demanding" rather than "most recent": when somebody has two open
 * campaigns, serving the harder floor satisfies both, whereas serving the easier
 * one leaves the other stuck.
 */
export async function activeFocusFor(
  userId: ObjectId,
  orgId: ObjectId | null,
): Promise<CampaignFocus | null> {
  if (!orgId) {
    return null;
  }
  const assignments = await (await assignmentsCollection())
    .find({ userId, orgId }, { projection: { campaignId: 1 } })
    .toArray();
  if (assignments.length === 0) {
    return null;
  }
  const campaigns = await (await campaignsCollection())
    .find({ _id: { $in: assignments.map((a) => a.campaignId) }, orgId })
    .toArray();

  const focuses = campaigns
    .map((c) => c.focus)
    .filter((f): f is CampaignFocus => f !== null && f !== undefined);
  if (focuses.length === 0) {
    return null;
  }
  return focuses.reduce((best, f) => (f.minDifficulty > best.minDifficulty ? f : best));
}
