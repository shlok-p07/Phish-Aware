/**
 * A demo organisation, built for screenshots, local development and showing an
 * admin view with real-looking data: Northwind Trading Co., seven members in
 * three departments, a mandatory campaign and a surprise test with a full
 * funnel, practice attempts, spaced-review rows, consents, notifications, an
 * audit trail, a pending invitation and onboarding survey responses.
 *
 * database/init/03-seed.js is generated from this (see mongoshExport.ts), so
 * there is one copy. It is typed against the app's own models, and built
 * through the app's own logic where the app has some: buildUserDoc for
 * members, gradeAttempt for attempts, levelForXp for levels. A demo attempt
 * therefore carries exactly the grading the app would have given it.
 * demoDataset.test.ts also checks every document against the live validators
 * and every reference against the rest of the dataset.
 *
 * Every _id is fixed (demoId), so seeding is an idempotent upsert of known
 * documents and removal deletes exactly what was added. No demo member has a
 * password; the accounts exist to populate views, not to be signed into.
 */
import { ObjectId } from "mongodb";
import type {
  AssignmentDoc,
  AttemptDoc,
  AuditLogDoc,
  CampaignDoc,
  ConsentDoc,
  DepartmentDoc,
  InvitationDoc,
  LessonCompletionDoc,
  NotificationDoc,
  OrganizationDoc,
  ReviewDoc,
  ScenarioDoc,
  SpecConventions,
  SurveyResponseDoc,
  UserDoc,
} from "@/db";
import { specDefaults } from "@/db/models/specConventions";
import { ONBOARDING_SURVEY_KEY, ONBOARDING_SURVEY_VERSION, type SurveyFeatures } from "@/lib/onboarding-survey";
import { encodeDepartmentTarget } from "@/lib/trainingTarget";
import { CONSENT_POLICY_VERSION } from "@/server/consent";
import type { CueId } from "@/server/cues";
import { gradeAttempt } from "@/server/grading";
import { LESSONS } from "@/server/lessons";
import { levelForXp } from "@/server/leveling";
import { NAME_TOKEN } from "@/server/personalize";
import { buildUserDoc } from "@/server/users";

/** deliveries is provisioned (see provision.ts) but has no model file yet. */
export interface DeliveryDoc extends SpecConventions {
  _id: ObjectId;
  deliveryId: ObjectId;
  campaignId: ObjectId;
  userId: ObjectId;
  orgId: ObjectId;
  scenarioId: ObjectId;
  sentAt: Date;
  openedAt: Date | null;
  clickedAt: Date | null;
  reportedAt: Date | null;
  outcome: "pending" | "opened" | "clicked" | "reported" | "ignored";
}

export interface DemoDataset {
  organizations: OrganizationDoc[];
  departments: DepartmentDoc[];
  users: UserDoc[];
  invitations: InvitationDoc[];
  scenarios: ScenarioDoc[];
  campaigns: CampaignDoc[];
  assignments: AssignmentDoc[];
  deliveries: DeliveryDoc[];
  attempts: AttemptDoc[];
  reviews: ReviewDoc[];
  consents: ConsentDoc[];
  notifications: NotificationDoc[];
  auditLogs: AuditLogDoc[];
  lessonCompletions: LessonCompletionDoc[];
  surveyResponses: SurveyResponseDoc[];
}

/**
 * Fixed, recognisable ids: `de` followed by a zero-padded counter. Stable ids
 * are what make re-seeding an upsert rather than a duplicate, and let removal
 * target only demo documents.
 */
export const demoId = (n: number): ObjectId => new ObjectId(`de${n.toString(16).padStart(22, "0")}`);

/** The demo org's email domain. `.example` is reserved (RFC 2606), so it can never collide with a real customer. */
export const DEMO_DOMAIN = "northwind.example";

/**
 * Invitation tokens must not be committed: anyone could redeem one. The
 * dataset carries this placeholder, and the mongosh script replaces it with
 * fresh random bytes on every run.
 */
export const RANDOM_TOKEN = "<random invitation token>";

const DAY = 24 * 60 * 60 * 1000;

interface Member {
  key: string;
  name: string;
  role: UserDoc["role"];
  department: "IT" | "Finance" | "Sales";
  workType: "Remote" | "Hybrid" | "Office";
  /** The model's starting awareness score, as a fraction. */
  awareness: number;
  lastLoginDaysAgo: number;
}

const MEMBERS: Member[] = [
  { key: "ada", name: "Ada Admin", role: "admin", department: "IT", workType: "Hybrid", awareness: 0.88, lastLoginDaysAgo: 1 },
  { key: "mona", name: "Mona Manager", role: "manager", department: "Finance", workType: "Office", awareness: 0.72, lastLoginDaysAgo: 2 },
  { key: "pat", name: "Pat Payable", role: "employee", department: "Finance", workType: "Office", awareness: 0.36, lastLoginDaysAgo: 3 },
  { key: "cory", name: "Cory Controller", role: "employee", department: "Finance", workType: "Hybrid", awareness: 0.59, lastLoginDaysAgo: 5 },
  { key: "sam", name: "Sam Seller", role: "employee", department: "Sales", workType: "Remote", awareness: 0.45, lastLoginDaysAgo: 1 },
  { key: "alex", name: "Alex Account", role: "employee", department: "Sales", workType: "Remote", awareness: 0.63, lastLoginDaysAgo: 7 },
];

/** Plausible survey answers for a member, consistent with their awareness score. */
function surveyFor(m: Member): SurveyFeatures {
  const careful = m.awareness >= 0.6 ? 1 : 0;
  return {
    emails_per_day: m.department === "Sales" ? 90 : 55,
    suspicious_emails_per_day: 2,
    password_length: careful ? 16 : 10,
    reuses_passwords: careful ? 0 : 1,
    uses_password_manager: careful,
    mfa_familiar: 1,
    mfa_enabled: careful,
    security_training: 1,
    clicks_links: Math.round((1 - m.awareness) * 60),
    opens_attachments: Math.round((1 - m.awareness) * 50),
    verifies_links: Math.round(m.awareness * 90),
    reports_suspicious: Math.round(m.awareness * 80),
    has_antivirus: 1,
    uses_vpn: m.workType === "Remote" ? 1 : 0,
    department: m.department,
    work_mode: m.workType,
  };
}

export function buildDemoDataset(now: Date): DemoDataset {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const stamp = (createdDaysAgo: number) => specDefaults(ago(createdDaysAgo));
  let next = 1;
  const nextId = () => demoId(next++);

  // --- organisation and departments --------------------------------------
  const orgId = nextId();
  const organizations: OrganizationDoc[] = [
    {
      _id: orgId,
      orgId,
      name: "Northwind Trading Co.",
      domain: DEMO_DOMAIN,
      ssoProvider: null,
      settings: { seatLimit: 25 },
      ...stamp(60),
    },
  ];

  const deptIds = { IT: nextId(), Finance: nextId(), Sales: nextId() };

  // --- members, built the way the app builds a user ----------------------
  const ids: Record<string, ObjectId> = {};
  const users: UserDoc[] = MEMBERS.map((m) => {
    const id = nextId();
    ids[m.key] = id;
    const doc = buildUserDoc({
      name: m.name,
      email: `${m.key}@${DEMO_DOMAIN}`,
      passwordHash: null,
      orgId,
      role: m.role,
      status: "active",
      lastLoginAt: ago(m.lastLoginDaysAgo),
      department: m.department,
      now: ago(45),
    });
    return {
      ...doc,
      _id: id,
      userId: id,
      workType: m.workType,
      surveyFeatures: surveyFor(m),
      phishingAwarenessScore: m.awareness,
      phishingAwarenessModelVersion: "awareness-v2.0.0",
      phishingAwarenessComputedAt: ago(44),
      onboardingCompleted: true,
    };
  });

  const departments: DepartmentDoc[] = (Object.keys(deptIds) as (keyof typeof deptIds)[]).map(
    (name) => ({
      _id: deptIds[name],
      departmentId: deptIds[name],
      orgId,
      name,
      parentId: null,
      managerId: name === "Finance" ? ids.mona! : null,
      ...stamp(60),
    }),
  );

  // --- scenarios, owned by the demo org so they never enter the shared library
  interface ScenarioSpec {
    isPhish: boolean;
    difficulty: number;
    sender: string;
    subject: string;
    body: string;
    attackType?: ScenarioDoc["attackType"];
    levers?: ScenarioDoc["emotionalLevers"];
    cues: { type: CueId; severity: number; explanation: string }[];
    link?: string;
  }
  const scenarioSpecs: ScenarioSpec[] = [
    {
      isPhish: true,
      difficulty: 3,
      sender: "Accounts Payable <ap@northwlnd.example>",
      subject: "URGENT: wire transfer approval needed today",
      body: `Hi ${NAME_TOKEN}, the CFO needs this wire approved before 3pm. Use the portal below.`,
      attackType: "bec",
      levers: ["urgency", "authority"],
      cues: [
        { type: "urgency_language", severity: 4, explanation: "A same-day deadline pressures you to skip verification." },
        { type: "sender_domain", severity: 5, explanation: "northwlnd.example swaps an i for an l in northwind." },
      ],
      link: "Approve transfer",
    },
    {
      isPhish: true,
      difficulty: 2,
      sender: "Rewards Team <rewards@nw-perks.example>",
      subject: "You've earned a $500 gift card",
      body: "Congratulations! Sign in with your work account to claim your reward.",
      attackType: "credential_harvesting",
      levers: ["reward", "curiosity"],
      cues: [
        { type: "credential_request", severity: 5, explanation: "A gift card never needs your work password." },
        { type: "sender_domain", severity: 3, explanation: "nw-perks.example is not a Northwind domain." },
      ],
      link: "Claim reward",
    },
    {
      isPhish: true,
      difficulty: 4,
      sender: "IT Service Desk <it-desk@northwind-support.example>",
      subject: "Your mailbox will be suspended",
      body: "Dear user, your mailbox exceeded its quota. Re-validate within 24 hours to avoid suspension.",
      attackType: "it_helpdesk_scam",
      levers: ["fear", "urgency"],
      cues: [
        { type: "generic_greeting", severity: 3, explanation: "Real IT messages address you by name." },
        { type: "mismatched_link", severity: 4, explanation: "The link text says northwind.example but points elsewhere." },
      ],
      link: "Re-validate mailbox",
    },
    {
      isPhish: false,
      difficulty: 1,
      sender: "Mona Manager <mona@northwind.example>",
      subject: "Team lunch on Friday",
      body: "Hi team, lunch is at noon on Friday in the 4th-floor kitchen. Reply if you have dietary needs.",
      cues: [],
    },
    {
      isPhish: false,
      difficulty: 2,
      sender: "Expenses <expenses@northwind.example>",
      subject: "Your monthly expense report is ready",
      body: "Your October report is ready to review in the usual expenses portal.",
      cues: [],
    },
  ];
  const scenarios: ScenarioDoc[] = scenarioSpecs.map((s) => {
    const id = nextId();
    return {
      _id: id,
      scenarioId: id,
      orgId,
      vector: "email",
      isPhish: s.isPhish,
      difficulty: s.difficulty,
      sender: s.sender,
      subject: s.subject,
      body: s.body,
      links: s.link ? [{ text: s.link, isSuspicious: s.isPhish }] : [],
      attachments: [],
      cues: s.cues,
      isOnboarding: false,
      ...(s.levers ? { emotionalLevers: s.levers } : {}),
      ...(s.attackType ? { attackType: s.attackType } : {}),
      source: "library",
      ...stamp(40),
    };
  });
  const [wire, giftCard, mailbox, lunch] = scenarios as [ScenarioDoc, ScenarioDoc, ScenarioDoc, ScenarioDoc];

  // --- campaigns ----------------------------------------------------------
  const mandatoryId = nextId();
  const surpriseId = nextId();
  const campaigns: CampaignDoc[] = [
    {
      _id: mandatoryId,
      campaignId: mandatoryId,
      orgId,
      type: "mandatory",
      name: "Q4 Security Training",
      scenarioIds: [wire._id, lunch._id],
      lessonIds: [],
      audience: {},
      dueDate: ago(-14),
      status: "active",
      createdBy: ids.ada!,
      target: "all",
      requiredScenarios: 5,
      focus: { vectors: ["email"], minDifficulty: 2, cues: ["sender_domain"] },
      ...stamp(10),
    },
    {
      _id: surpriseId,
      campaignId: surpriseId,
      orgId,
      type: "surprise_test",
      name: "Wire Fraud Drill",
      scenarioIds: [wire._id],
      lessonIds: [],
      audience: {},
      dueDate: null,
      status: "completed",
      createdBy: ids.ada!,
      target: encodeDepartmentTarget("Finance"),
      requiredScenarios: 1,
      focus: null,
      ...stamp(6),
    },
  ];

  const assignments: AssignmentDoc[] = (
    [
      ["pat", "completed", 100, 1],
      ["cory", "in_progress", 60, null],
      ["sam", "assigned", 0, null],
      ["alex", "overdue", 20, null],
    ] as const
  ).map(([who, status, progress, completedDaysAgo]) => {
    const id = nextId();
    return {
      _id: id,
      assignmentId: id,
      campaignId: mandatoryId,
      userId: ids[who]!,
      orgId,
      status,
      progress,
      completedAt: completedDaysAgo === null ? null : ago(completedDaysAgo),
      ...stamp(10),
    };
  });

  // --- the surprise test's funnel: reported, clicked, opened, ignored ----
  const deliveries: DeliveryDoc[] = (
    [
      ["cory", { openedAt: 4, clickedAt: null, reportedAt: 4 }, "reported"],
      ["pat", { openedAt: 4, clickedAt: 4, reportedAt: null }, "clicked"],
      ["mona", { openedAt: 3, clickedAt: null, reportedAt: null }, "opened"],
    ] as const
  ).map(([who, t, outcome]) => {
    const id = nextId();
    const at = (d: number | null) => (d === null ? null : ago(d));
    return {
      _id: id,
      deliveryId: id,
      campaignId: surpriseId,
      userId: ids[who]!,
      orgId,
      scenarioId: wire._id,
      sentAt: ago(4),
      openedAt: at(t.openedAt),
      clickedAt: at(t.clickedAt),
      reportedAt: at(t.reportedAt),
      outcome,
      ...stamp(4),
    };
  });

  // --- practice attempts, graded by the app's own grader ------------------
  const attemptSpecs: [string, ScenarioDoc, boolean, CueId[], number, number, ObjectId | null][] = [
    ["pat", wire, true, ["urgency_language"], 70, 3, mandatoryId],
    ["pat", lunch, true, [], 40, 3, mandatoryId],
    ["cory", wire, true, ["urgency_language", "sender_domain"], 85, 2, mandatoryId],
    ["sam", giftCard, false, [], 55, 2, null],
    ["alex", mailbox, true, ["mismatched_link"], 60, 6, null],
    ["mona", giftCard, true, ["credential_request", "sender_domain"], 90, 2, null],
  ];
  const attempts: AttemptDoc[] = attemptSpecs.map(
    ([who, scenario, verdict, selected, confidence, daysAgo, campaignId]) => {
      const id = nextId();
      const graded = gradeAttempt(scenario, verdict, selected, confidence);
      return {
        _id: id,
        attemptId: id,
        userId: ids[who]!,
        orgId,
        scenarioId: scenario._id,
        campaignId,
        verdict: verdict ? "phish" : "legit",
        selectedCues: graded.selectedCues,
        confidence,
        correct: graded.correct,
        missedCues: graded.missedCues,
        falseCues: graded.falseCues,
        caughtCues: graded.caughtCues,
        explanation: graded.explanation,
        calibrationNote: graded.calibrationNote,
        xpAwarded: graded.xpAwarded,
        leversPresent: scenario.emotionalLevers ?? [],
        ...(scenario.attackType ? { attackType: scenario.attackType } : {}),
        ...stamp(daysAgo),
      };
    },
  );

  // Members' progress follows from their attempts, as it would in the app.
  for (const user of users) {
    const mine = attempts.filter((a) => a.userId.equals(user._id));
    user.xp = mine.reduce((sum, a) => sum + a.xpAwarded, 0);
    user.level = levelForXp(user.xp);
    user.badges = mine.some((a) => a.correct) ? ["first_catch"] : [];
  }

  // --- spaced review, following the misses above --------------------------
  const reviews: ReviewDoc[] = (
    [
      ["pat", "cueType", "sender_domain", -1, 2],
      ["sam", "cueType", "credential_request", 0, 2],
      ["sam", "emotionalLever", "reward", 1, null],
    ] as const
  ).map(([who, targetType, targetValue, dueInDays, lastDaysAgo]) => {
    const id = nextId();
    return {
      _id: id,
      reviewId: id,
      userId: ids[who]!,
      orgId,
      targetType,
      targetValue,
      dueAt: ago(-dueInDays),
      interval: 1,
      easeFactor: 2.5,
      lastReviewedAt: lastDaysAgo === null ? null : ago(lastDaysAgo),
      streak: 0,
      ...stamp(3),
    };
  });

  // --- consents: everyone agreed to processing; one declined profiling ----
  const consents: ConsentDoc[] = users.flatMap((u) =>
    (["data_processing", "emotional_profiling"] as const).map((policyType) => {
      const id = nextId();
      const declined = policyType === "emotional_profiling" && u._id.equals(ids.alex!);
      return {
        _id: id,
        consentId: id,
        userId: u._id,
        orgId,
        policyType,
        policyVersion: CONSENT_POLICY_VERSION,
        granted: !declined,
        grantedAt: declined ? null : ago(44),
        revokedAt: null,
        ...stamp(44),
      };
    }),
  );

  const notifications: NotificationDoc[] = (
    [
      ["sam", "assignment", "New training assigned", "Q4 Security Training is due in two weeks.", false, 10],
      ["alex", "reminder", "Training overdue", "Q4 Security Training is past due.", false, 1],
      ["pat", "result", "Training complete", "You finished Q4 Security Training.", true, 1],
    ] as const
  ).map(([who, type, title, body, read, daysAgo]) => {
    const id = nextId();
    return {
      _id: id,
      notificationId: id,
      userId: ids[who]!,
      orgId,
      type,
      title,
      body,
      channel: "in_app",
      read,
      sentAt: ago(daysAgo),
      subjectId: mandatoryId,
      ...stamp(daysAgo),
    };
  });

  // --- a pending invitation ------------------------------------------------
  const invitationId = nextId();
  const invitations: InvitationDoc[] = [
    {
      _id: invitationId,
      invitationId,
      orgId,
      email: `robin@${DEMO_DOMAIN}`,
      name: "Robin Rookie",
      role: "employee",
      departmentId: deptIds.IT,
      department: "IT",
      token: RANDOM_TOKEN,
      status: "pending",
      invitedBy: ids.ada!,
      expiresAt: ago(-12),
      acceptedAt: null,
      acceptedUserId: null,
      ...stamp(2),
    },
  ];

  const auditLogs: AuditLogDoc[] = (
    [
      ["training.created", "campaign", mandatoryId, 10],
      ["training.created", "campaign", surpriseId, 6],
      ["member.invited", "invitation", invitationId, 2],
    ] as const
  ).map(([action, targetType, targetId, daysAgo]) => {
    const id = nextId();
    return {
      _id: id,
      auditLogId: id,
      orgId,
      actorId: ids.ada!,
      action,
      targetType,
      targetId,
      // RFC 5737 documentation range, never a real client.
      ip: "203.0.113.10",
      ...stamp(daysAgo),
      metadata: {},
    };
  });

  const lessonCompletions: LessonCompletionDoc[] = (
    [
      ["pat", 0, 8],
      ["pat", 1, 5],
      ["cory", 0, 4],
    ] as const
  ).map(([who, lessonIndex, daysAgo]) => {
    const id = nextId();
    return {
      _id: id,
      lessonCompletionId: id,
      userId: ids[who]!,
      lessonId: LESSONS[lessonIndex]!.id,
      orgId,
      completedAt: ago(daysAgo),
      ...stamp(daysAgo),
    };
  });

  // --- onboarding survey responses, written the way the onboarding route writes them
  const surveyResponses: SurveyResponseDoc[] = users.map((u) => {
    const id = nextId();
    const features = u.surveyFeatures!;
    return {
      _id: id,
      surveyResponseId: id,
      surveyKey: ONBOARDING_SURVEY_KEY,
      surveyVersion: ONBOARDING_SURVEY_VERSION,
      purpose: "onboarding_baseline",
      userId: u._id,
      orgId,
      answers: Object.entries(features).map(([questionKey, value]) => ({ questionKey, value })),
      derivedSignals: { ...features },
      baselineRiskContribution: Math.round(u.phishingAwarenessScore * 100),
      completedAt: ago(44),
      ...stamp(44),
    };
  });

  return {
    organizations,
    departments,
    users,
    invitations,
    scenarios,
    campaigns,
    assignments,
    deliveries,
    attempts,
    reviews,
    consents,
    notifications,
    auditLogs,
    lessonCompletions,
    surveyResponses,
  };
}
