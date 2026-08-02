import { ObjectId } from "mongodb";
import { scenariosCollection, specDefaults } from "@/db";
import { generatePhishingScenario, type GenerateScenarioParams } from "./scenarioGenerator";

/**
 * How many not-yet-attempted, AI-generated scenarios per vector we try to
 * keep on hand. Requests serve instantly from whatever's already sitting in
 * the pool (library + previously-generated) rather than blocking on a live
 * ~5-20s two-stage LLM call every round; this is the target the background
 * top-up below tries to maintain so that pool stays fresh instead of a
 * request ever seeing "nothing new left."
 */
export const POOL_TARGET_SIZE = 6;

// Per-process guard so a burst of concurrent requests that all notice the
// pool is low for the same vector don't each kick off their own top-up call
// -- at most one generation in flight per vector at a time. Doesn't prevent
// duplicate work across multiple server instances, but bounds it to a
// reasonable amount for the likely single-instance deployment here, which
// matters given how easily the shared Groq/Gemini free-tier quotas exhaust.
const topUpInFlight = new Set<string>();

// After a failed top-up (both Groq and Gemini unavailable/exhausted), don't
// retry this vector again until this cooldown elapses. Without it, every
// single request against a dry-quota vector re-attempts and re-fails a live
// LLM call -- pure log noise and wasted requests against providers that are
// already known to be down, since the pool is still serving fine from what's
// already there. Kept short enough to self-heal quickly once quota frees up,
// without needing a server restart.
const TOP_UP_COOLDOWN_MS = 60_000;
const cooldownUntil = new Map<string, number>();

/**
 * Fires off (but does not await) one more generation call to replenish a
 * vector's pool if it's below target -- using this request's own,
 * already-computed personalization context (department/difficulty/tactic),
 * so the pool grows with real, diverse, non-generic content over time as
 * actual traffic flows through it rather than a separately-scheduled job
 * guessing at context. A failure here is silent by design: the pool simply
 * doesn't grow this round, and the next request that finds it still low
 * will try again once the cooldown above has elapsed.
 */
export function topUpPoolInBackground(
  params: GenerateScenarioParams,
  orgId: ObjectId | null,
  currentPoolSize: number,
): void {
  if (currentPoolSize >= POOL_TARGET_SIZE) return;
  if (topUpInFlight.has(params.vector)) return;
  const cooldown = cooldownUntil.get(params.vector);
  if (cooldown !== undefined && Date.now() < cooldown) return;
  topUpInFlight.add(params.vector);

  void (async () => {
    try {
      const generated = await generatePhishingScenario(params);
      if (!generated) {
        cooldownUntil.set(params.vector, Date.now() + TOP_UP_COOLDOWN_MS);
        return;
      }
      cooldownUntil.delete(params.vector);
      const scenarios = await scenariosCollection();
      const id = new ObjectId();
      await scenarios.insertOne({
        _id: id,
        scenarioId: id,
        orgId,
        ...generated,
        source: "ai_generated",
        ...specDefaults(),
      });
    } catch (err) {
      cooldownUntil.set(params.vector, Date.now() + TOP_UP_COOLDOWN_MS);
      console.error("[scenarioPool] background top-up failed:", err);
    } finally {
      topUpInFlight.delete(params.vector);
    }
  })();
}
