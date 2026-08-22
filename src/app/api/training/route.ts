import { ObjectId } from "mongodb";
import {
  assignmentsCollection,
  campaignsCollection,
  attemptsCollection,
  usersCollection,
  scenariosCollection,
  toObjectId,
} from "@/db";
import { json, requireUserId, withErrorHandling } from "@/server/http";
import { assignmentProgress, describeFocus } from "@/server/trainingProgress";
import { completedLessonIds } from "@/server/lessonCompletion";
import { dueSoonNotification, notifyOnce, overdueNotification } from "@/server/notifications";

/** How close a deadline has to be before somebody is nudged about it. */
const DUE_SOON_DAYS = 3;

export const dynamic = "force-dynamic";

/**
 * The employee's side of a training campaign.
 *
 * Assignments were being written and never read: every other query against this
 * collection sits behind an org-admin check, so an admin could make a campaign
 * mandatory for a department and the people in it had no way to find out. This
 * is the read that closes that loop.
 *
 * Progress is counted from practice attempts recorded since the assignment was
 * created, rather than from the stored `progress` field -- nothing writes that
 * field, so reporting it would show everyone zero forever. Counting attempts is
 * a fair reading of "did they do the practice this asked for", and it needs no
 * new write path on the practice route.
 */
export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();

  // Scoped to the org the caller is in *now*, not just their user id. Removing a
  // member sets orgId to null and deliberately keeps their history, but it does
  // not delete their assignments -- so filtering on userId alone showed an
  // ex-employee their former employer's mandatory training indefinitely.
  const me = await (await usersCollection()).findOne(
    { _id: userId },
    { projection: { orgId: 1 } },
  );
  if (!me?.orgId) {
    return json([]);
  }

  const assignments = await (await assignmentsCollection())
    .find({ userId, orgId: me.orgId })
    .toArray();
  if (assignments.length === 0) {
    return json([]);
  }

  const campaignIds = [...new Set(assignments.map((a) => a.campaignId.toString()))].map(
    (id) => new ObjectId(id),
  );
  const campaigns = await (await campaignsCollection())
    .find({ _id: { $in: campaignIds } })
    .toArray();
  const campaignById = new Map(campaigns.map((c) => [c._id.toString(), c]));

  const attemptRows = await (await attemptsCollection()).find({ userId }).toArray();
  // A focused campaign is judged against what was actually practised, so the
  // scenarios behind these attempts have to be resolved. Only the ones
  // referenced, and only the fields a focus is checked against.
  const scenarioIds = [
    ...new Set(attemptRows.filter((a) => a.scenarioId).map((a) => a.scenarioId.toString())),
  ]
    .map(toObjectId)
    .filter((id): id is ObjectId => id !== null);
  const scenarioRows = scenarioIds.length
    ? await (await scenariosCollection())
        .find({ _id: { $in: scenarioIds } }, { projection: { vector: 1, difficulty: 1, cues: 1 } })
        .toArray()
    : [];
  const byScenario = new Map(scenarioRows.map((sc) => [sc._id.toString(), sc]));

  // One read for every assignment in the listing rather than one apiece.
  const readLessons = await completedLessonIds(userId);
  const attempts = attemptRows.map((a) => {
    const scenario = a.scenarioId ? byScenario.get(a.scenarioId.toString()) : undefined;
    return {
      createdAt: a.createdAt,
      vector: scenario?.vector,
      difficulty: scenario?.difficulty,
      cues: (scenario?.cues ?? []).map((c) => c.type),
    };
  });
  const now = new Date();

  const rows = assignments.flatMap((assignment) => {
    const campaign = campaignById.get(assignment.campaignId.toString());
    // An assignment whose campaign has been deleted is not something to render
    // as a nameless obligation.
    if (!campaign) {
      return [];
    }

    const required = campaign.requiredScenarios ?? 0;
    const dueDate = campaign.dueDate ?? null;
    // Reading the campaign asks for. Previously counted for nothing, so an
    // assignment naming lessons could never reach completion.
    const assignedLessons = campaign.lessonIds ?? [];
    const progress = assignmentProgress({
      assignedAt: assignment.createdAt,
      requiredScenarios: required,
      dueDate,
      attempts,
      focus: campaign.focus ?? null,
      requiredLessons: assignedLessons.length,
      completedLessons: assignedLessons.filter((id) => readLessons.has(String(id))).length,
      now,
    });

    return [
      {
        id: assignment._id.toString(),
        campaignId: campaign._id.toString(),
        title: campaign.name,
        dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
        requiredScenarios: required,
        focusLabel: describeFocus(campaign.focus ?? null),
        ...progress,
      },
    ];
  });

  // Soonest deadline first, and anything without one last: a list of
  // obligations is only useful in the order they come due.
  rows.sort((a, b) => {
    if (a.dueDate === b.dueDate) return a.title.localeCompare(b.title);
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });

  // Nudges, written where the assignments are already in hand. There is no
  // scheduler in this app, so the sweep rides the request that would show these
  // anyway -- and notifyOnce keeps it to one notification per campaign per
  // person however many times a page is loaded.
  await Promise.all(
    rows.flatMap((row) => {
      if (row.status === "completed" || row.dueDate === null) return [];
      const due = new Date(`${row.dueDate}T00:00:00.000Z`);
      const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
      if (row.status === "overdue") {
        return [
          notifyOnce({
            userId,
            orgId: me.orgId!,
            type: "reminder",
            ...overdueNotification(row.title, due),
            subjectId: new ObjectId(row.campaignId),
          }),
        ];
      }
      if (daysLeft <= DUE_SOON_DAYS) {
        return [
          notifyOnce({
            userId,
            orgId: me.orgId!,
            type: "reminder",
            ...dueSoonNotification(row.title, due),
            subjectId: new ObjectId(row.campaignId),
          }),
        ];
      }
      return [];
    }),
  );

  return json(rows.map(({ campaignId: _campaignId, ...row }) => row));
});
