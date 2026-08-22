import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { scenariosCollection, attemptsCollection, usersCollection, specDefaults } from "@/db";
import type { ScenarioDoc } from "@/db";
import { GetNextPracticeScenarioResponse } from "@/api-zod";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";
import {
  difficultyForAwarenessScore,
  pickIsPhish,
  pickVector,
  PRACTICE_VECTORS,
  type PracticeVector,
  type VectorPreference,
} from "@/server/attackProfiles";
import { selectAttackProfile } from "@/server/attackProfileSelector";
import { mayProfileEmotionally } from "@/server/consent";
import { generatePhishingScenario } from "@/server/scenarioGenerator";
import { topUpPoolInBackground } from "@/server/scenarioPool";
import { activeFocusFor } from "@/server/assignedFocus";
import { dueCues } from "@/server/reviewSchedule";
import { workspaceForMember } from "@/server/orgWorkspace";
import { personalizeScenario } from "@/server/personalize";
import {
  selectScenario,
  targetDifficulty,
  type Candidate,
  type HistoryEntry,
} from "@/server/scenarioFit";

export const dynamic = "force-dynamic";

function parseVectorPreference(raw: string | null): VectorPreference | undefined {
  // Checked against PRACTICE_VECTORS rather than an inline || chain. The chain
  // never learned about qr, so ?vector=qr fell through to undefined and the
  // round was randomised -- the filter looked like it worked and quietly did
  // not. Anything unrecognised is still undefined, which means "mixed".
  if (raw === "mixed") return raw;
  return raw && (PRACTICE_VECTORS as readonly string[]).includes(raw)
    ? (raw as VectorPreference)
    : undefined;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const userId = await requireUserId();
  const vectorPreference = parseVectorPreference(req.nextUrl.searchParams.get("vector"));

  const scenarios = await scenariosCollection();
  // Newest first. This is a contract, not an incidental: scenarioFit weights
  // recent attempts far above older ones and reads position as recency. The
  // rules engine in attackProfileSelector is order-independent by construction
  // -- it compares createdAt to find the latest -- so sorting here serves one
  // consumer without disturbing the other.
  const attempted = await (await attemptsCollection())
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
  const attemptedIds = new Set(attempted.map((a) => a.scenarioId.toString()));

  // Generate a fresh scenario on (almost) every round rather than once and
  // reusing it -- an unattempted generated scenario would otherwise just sit
  // in the pool and keep getting served back on every refresh/next call
  // until someone actually completes it, which looked like the generator was
  // stuck repeating the same department/attack-type combo. Phase 1 (see
  // project's AI-pipeline spec): department/work type feed the prompt,
  // tactic/attack type are selected by the adaptive rules engine using this
  // user's persisted taxonomy history, with cold-start and 30% exploration.
  const user = await (await usersCollection()).findOne({ _id: userId });
  // Ayoub's rules engine owns *which category* to practise: it weights attack
  // type and persuasion tactic by this learner's weakness, overconfidence,
  // underexposure and time since last seen, with a cold start and 30%
  // exploration. Nothing below second-guesses that choice.
  // Personalised persuasion weighting only with consent. Without it the learner
  // still gets department-appropriate material, chosen without reference to what
  // has worked on them before -- refusing narrows how the choice is made, not
  // what they are allowed to practise.
  const personalised = await mayProfileEmotionally(userId);
  const { persuasionTactic, attackType } = selectAttackProfile({
    department: user?.department ?? null,
    history: attempted,
    personalised,
  });

  // What the category selector does not decide is *how hard* the round should
  // be, or which concrete pooled scenario to serve. Those are handled below.
  //
  // `caughtCues` union `missedCues` is the scenario's real cue set. `falseCues`
  // are cues the learner flagged that were never present, so they say nothing
  // about what the scenario contained and are excluded.
  // difficulty comes from the scenario that was served, which the controller
  // steps from -- without it, it would recompute a level from scratch every
  // round and snap between bands.
  const attemptedScenarios = await scenarios
    .find({ _id: { $in: attempted.map((a) => a.scenarioId) } }, { projection: { difficulty: 1 } })
    .toArray();
  const difficultyById = new Map(
    attemptedScenarios.map((s) => [s._id.toString(), s.difficulty]),
  );
  const history: HistoryEntry[] = attempted.map((a) => ({
    scenarioId: a.scenarioId.toString(),
    correct: a.correct,
    isPhish: a.correct ? a.verdict === "phish" : a.verdict !== "phish",
    difficulty: difficultyById.get(a.scenarioId.toString()),
  }));

  // The onboarding score is a starting point, not a permanent verdict. Once
  // there is enough history the level tracks how the learner is doing now,
  // which is what stops a improving trainee being served material they have
  // already outgrown.
  const startingDifficulty = difficultyForAwarenessScore(user?.phishingAwarenessScore ?? 0);
  // An assigned campaign steers practice toward what it asks for, so a member
  // with mandatory training on lookalike domains meets those rather than
  // whatever the pool happened to offer. Only when the learner has not asked for
  // something specific themselves: an explicit choice in the UI is still theirs.
  const focus = await activeFocusFor(userId, user?.orgId ?? null);
  const focusedVectors = focus?.vectors ?? [];
  // Independently, whatever their own review schedule says has come back up. A
  // red flag missed a fortnight ago resurfaces on its own rather than waiting
  // for the pool to happen to offer it again.
  const reviewCues = await dueCues(userId);
  // Channels this organisation trains on. Enforced here rather than only by
  // hiding tabs in the UI: the vector arrives as a query parameter, so a member
  // of an organisation that trains on email alone could otherwise ask for voice
  // scenarios directly and be served them.
  const workspace = await workspaceForMember(user?.orgId ?? null);
  const allowedVectors = workspace?.practiceVectors ?? [];
  const isAllowed = (v: VectorPreference | undefined) =>
    v === undefined || v === "mixed" || allowedVectors.length === 0 || allowedVectors.includes(v);

  const requestedPreference = isAllowed(vectorPreference) ? vectorPreference : undefined;
  const steerable = allowedVectors.length > 0
    ? focusedVectors.filter((v) => allowedVectors.includes(v as PracticeVector))
    : focusedVectors;
  const effectivePreference =
    requestedPreference === undefined && steerable.length > 0
      ? (steerable[Math.floor(Math.random() * steerable.length)] as VectorPreference)
      : requestedPreference;

  const adaptiveLevel = targetDifficulty(history, startingDifficulty);
  // The campaign's floor wins over the adaptive level, never the other way: a
  // campaign that asks for level 4 is a requirement, and quietly serving level 2
  // because the learner is struggling would mark the requirement complete
  // without them ever meeting the material.
  const level = Math.max(adaptiveLevel, focus?.minDifficulty ?? 1);
  // With no preference at all, draw only from the allowed set rather than the
  // full list.
  const vector =
    effectivePreference === undefined && allowedVectors.length > 0
      ? allowedVectors[Math.floor(Math.random() * allowedVectors.length)]!
      : pickVector(effectivePreference);
  const isPhish = pickIsPhish();
  const genParams = {
    vector,
    isPhish,
    department: user?.department ?? null,
    workType: user?.workType ?? null,
    // Generate at the level the learner is actually working at, so the pool
    // keeps up with them instead of refilling with material they have outgrown.
    difficulty: level,
    persuasionTactic,
    attackType,
  };

  // Serve instantly from whatever's already sitting in the pool (the static
  // library plus previously live-generated scenarios) instead of blocking
  // every single round on a live ~5-20s two-stage LLM call. A round only
  // waits on live generation if this vector's pool is completely dry for
  // this user (a brand-new vector, or someone who's worked through
  // everything generated so far) -- otherwise generation happens in the
  // background (see topUpPoolInBackground) so the pool stays replenished
  // with fresh, personalized content for next time without anyone waiting
  // on it.
  // Generated content belongs to the org it was generated for; the static
  // library (orgId null) is shared by everyone. Nothing org-identifying reaches
  // the model -- generation input is vector/isPhish/department/workType/
  // difficulty/tactic/attack type and nothing else -- so this is not a
  // confidentiality boundary, it is ownership: a customer's pool reflects their
  // own department mix rather than filling up with material generated for
  // someone else's. Keeping the shared library in the union is what makes it
  // seamless: a brand-new org still has a full pool on day one instead of
  // waiting on a cold generator.
  const orgScope = user?.orgId
    ? { $or: [{ orgId: null }, { orgId: user.orgId }] }
    : { orgId: null };
  const pool = await scenarios
    .find({ vector, isOnboarding: false, ...orgScope })
    .toArray();
  let candidates: ScenarioDoc[] = pool.filter((s) => !attemptedIds.has(s._id.toString()));

  // Someone who has worked through everything used to wait on a live two-stage
  // LLM call before seeing anything -- up to ~40s, and longer once the client
  // retries. If either provider is rate limited or unconfigured they waited
  // that long only to be told there was nothing. Resurfacing a scenario they
  // have already seen is instant and strictly better than a spinner, and the
  // background top-up still brings in fresh material for next round.
  const exhausted = candidates.length === 0 && pool.length > 0;
  if (exhausted) {
    candidates = pool;
  }

  if (candidates.length > 0) {
    const availableGenerated = candidates.filter((s) => s.source === "ai_generated").length;
    topUpPoolInBackground(genParams, user?.orgId ?? null, availableGenerated);
  } else {
    // Only now is blocking justified: this vector has nothing stored at all,
    // so generation is the only way to answer the request.
    // Interactive: the pool is dry for this learner, so somebody is genuinely
    // waiting on this call rather than it topping up a shelf. That lets it draw
    // on the budget background top-up holds in reserve.
    const generated = await generatePhishingScenario(genParams, "interactive");
    if (generated) {
      const id = new ObjectId();
      const inserted: ScenarioDoc = {
        _id: id,
        scenarioId: id,
        orgId: user?.orgId ?? null,
        ...generated,
        source: "ai_generated",
        ...specDefaults(),
      };
      await scenarios.insertOne(inserted);
      candidates = [inserted];
    }
  }

  if (candidates.length === 0) {
    return error(404, "No practice scenarios available");
  }

  const candidateViews: Candidate[] = candidates.map((s) => ({
    id: s._id.toString(),
    difficulty: s.difficulty,
    isPhish: s.isPhish,
    cues: (s.cues ?? []).map((c) => c.type),
  }));

  const picked = selectScenario(candidateViews, history, {
    startingDifficulty,
    minDifficulty: focus?.minDifficulty ?? 1,
    focusCues: focus?.cues ?? [],
    reviewCues,
  });
  const chosen = picked && candidates.find((s) => s._id.toString() === picked.id);
  if (!chosen) {
    // Unreachable while candidates is non-empty, but asserting non-null here
    // would hide a genuine selection bug behind a runtime crash instead.
    return error(404, "No practice scenarios available");
  }

  // The stored scenario is shared across everyone practicing, so it addresses
  // the reader by a placeholder token. Resolve it to *this* user's name on the
  // way out -- that's what makes the same pooled scenario read as personal.
  const personalized = personalizeScenario(chosen, user?.name);

  return json(
    GetNextPracticeScenarioResponse.parse({
      id: chosen._id.toString(),
      vector: personalized.vector,
      sender: personalized.sender,
      subject: personalized.subject,
      body: personalized.body,
      links: personalized.links,
      attachments: personalized.attachments,
      difficulty: personalized.difficulty,
    }),
  );
});
