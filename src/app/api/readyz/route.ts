import { ReadinessCheckResponse } from "@/api-zod";
import { usersCollection } from "@/db";
import { json, withErrorHandling } from "@/server/http";

/**
 * Whether the app can actually serve traffic.
 *
 * /healthz answers "is the process up" and never touches the database, so an
 * uptime monitor pointed at it reported healthy while the one dependency the app
 * cannot work without was unreachable. This checks that, mirroring the split the
 * ML service already uses.
 *
 * Also the cluster keepalive. Atlas pauses a free-tier cluster after 60 days
 * without activity -- which is what the inactivity warnings are about -- so a
 * scheduled request here keeps it awake as a side effect of a check that is
 * worth having anyway. Nothing is written.
 */
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  let database: "ok" | "unreachable" = "unreachable";
  try {
    // A real query rather than a ping: connecting proves the cluster is
    // reachable, but reading proves the app can actually use it -- and it is
    // unambiguously the kind of operation Atlas counts as activity. Projected
    // to _id and capped at one document, so cost does not grow with the data.
    const users = await usersCollection();
    await users.findOne({}, { projection: { _id: 1 } });
    database = "ok";
  } catch (cause) {
    // Logged for operators, not returned: this endpoint is unauthenticated, so
    // it reports reachability and nothing about why.
    console.error("[readyz] database unreachable", cause);
  }

  // Always 200. This is a status document, and a probe that 503s is harder to
  // distinguish from the deployment itself being gone.
  return json(
    ReadinessCheckResponse.parse({
      ready: database === "ok",
      database,
      checkedAt: new Date().toISOString(),
    }),
  );
});
