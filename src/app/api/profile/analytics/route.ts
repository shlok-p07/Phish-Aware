import { ObjectId } from "mongodb";
import { toObjectId } from "@/db/objectId";
import { attemptsCollection, scenariosCollection } from "@/db";
import { GetAnalyticsResponse } from "@/api-zod";
import { json, requireUserId, withErrorHandling } from "@/server/http";
import { computeLearnerAnalytics } from "@/server/learnerAnalytics";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const attempts = await (await attemptsCollection()).find({ userId }).toArray();
  // Only the scenarios these attempts reference. This used to read every
  // scenario in the database to build a lookup for a handful of ids, which grew
  // with the generated pool on every request and reached across organisations
  // for content it had no reason to see.
  const referenced = [...new Set(attempts.map((a) => a.scenarioId.toString()))]
    .map(toObjectId)
    .filter((id): id is ObjectId => id !== null);
  const scenarios = referenced.length
    ? await (await scenariosCollection()).find({ _id: { $in: referenced } }).toArray()
    : [];
  const analytics = computeLearnerAnalytics(
    attempts,
    new Map(scenarios.map((scenario) => [scenario._id.toString(), scenario.vector])),
  );

  return json(GetAnalyticsResponse.parse(analytics));
});
