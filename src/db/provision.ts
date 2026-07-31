/**
 * Ports phishaware-db/init/01-validators.js and 02-indexes.js to the Node
 * MongoDB driver so schema validators, indexes, and seed data are applied
 * automatically on server startup (see src/instrumentation.ts) -- nobody
 * has to run `bun run db:init`/`db:seed` by hand, on a teammate's machine,
 * in Docker, or on a Render deploy. Idempotent: safe to run on every boot
 * against an already-provisioned cluster (collMod/createIndex are no-ops
 * when nothing changed).
 *
 * Kept in lockstep with the mongosh scripts in phishaware-db/init/, which
 * remain the source of truth for the shared cross-team schema and are still
 * runnable standalone (`bun run db:init`) for anyone who prefers mongosh.
 */
import type { Db, Document } from "mongodb";

type Schema = Document;

const ROLE = ["admin", "manager", "employee"];
const VECTOR = ["email", "sms", "voice", "qr", "social", "web"];
const LEVER = ["urgency", "curiosity", "authority", "fear", "reward", "trust", "scarcity", "social_proof"];
const CUE = [
  "sender_domain", "mismatched_link", "urgency_language", "generic_greeting",
  "credential_request", "spelling_grammar", "unexpected_attachment", "suspicious_qr",
];
const CAMPAIGN_TYPE = ["training", "mandatory", "surprise_test"];
const ASSIGNMENT_STATUS = ["assigned", "in_progress", "completed", "overdue"];
const DELIVERY_OUTCOME = ["pending", "opened", "clicked", "reported", "ignored"];
const INVITATION_STATUS = ["pending", "accepted", "expired", "revoked"];
const CONSENT_TYPE = ["emotional_profiling", "data_processing"];
const NOTIFICATION_TYPE = ["assignment", "reminder", "result", "system", "survey"];
const SURVEY_PURPOSE = ["onboarding_baseline", "periodic_pulse"];
const SURVEY_Q_TYPE = ["likert_1_5", "single_choice", "multi_choice", "boolean"];

const PK: Record<string, string> = {
  organizations: "orgId", departments: "departmentId", users: "userId",
  profiles: "profileId", scenarios: "scenarioId", lessons: "lessonId",
  attempts: "attemptId", reviews: "reviewId", campaigns: "campaignId",
  assignments: "assignmentId", deliveries: "deliveryId", invitations: "invitationId",
  consents: "consentId", notifications: "notificationId", auditLogs: "auditLogId",
  surveys: "surveyId", surveyResponses: "surveyResponseId",
};

const oid: Schema = { bsonType: "objectId" };
const oidOrNull: Schema = { bsonType: ["objectId", "null"] };
const str: Schema = { bsonType: "string" };
const strOrNull: Schema = { bsonType: ["string", "null"] };
const dateOrNull: Schema = { bsonType: ["date", "null"] };
const num: Schema = { bsonType: ["int", "long", "double"] };
const numR = (min: number, max: number): Schema => ({
  bsonType: ["int", "long", "double"],
  minimum: min,
  maximum: max,
});

// lessons keep a string slug as _id (e.g. "email-phishing") for pretty
// /learn/[id] URLs, so their named PK mirrors that type instead of ObjectId.
const PK_TYPE: Record<string, Schema> = { lessons: str };

const linkItem: Schema = {
  bsonType: "object",
  required: ["text", "isSuspicious"],
  properties: { text: str, isSuspicious: { bsonType: "bool" } },
};
const attachmentItem: Schema = {
  bsonType: "object",
  required: ["name", "isSuspicious"],
  properties: { name: str, isSuspicious: { bsonType: "bool" } },
};
const cueItem: Schema = {
  bsonType: "object",
  required: ["type", "severity", "explanation"],
  properties: { type: { enum: CUE }, severity: num, explanation: str },
};

async function make(
  db: Db,
  name: string,
  required: string[],
  props: Record<string, Schema>,
): Promise<void> {
  const pk = PK[name];
  const properties: Record<string, Schema> = {
    metadata: { bsonType: "object" },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
    deletedAt: dateOrNull,
    ...props,
  };
  const req = [...required];
  if (pk) {
    properties[pk] = PK_TYPE[name] || oid;
    req.unshift(pk);
  }
  const validator = { $jsonSchema: { bsonType: "object", required: req, properties } };
  const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
  if (existing.length > 0) {
    await db.command({ collMod: name, validator, validationLevel: "moderate", validationAction: "error" });
  } else {
    await db.createCollection(name, { validator, validationLevel: "moderate", validationAction: "error" });
  }
}

export async function ensureSchema(db: Db): Promise<void> {
  await make(db, "organizations", ["name", "domain"], {
    name: str, domain: strOrNull,
    ssoProvider: strOrNull,
    settings: { bsonType: "object" },
  });

  await make(db, "departments", ["orgId", "name"], {
    orgId: oid, name: str, parentId: oidOrNull, managerId: oidOrNull,
  });

  await make(db, "users", ["orgId", "email", "name", "role"], {
    orgId: oidOrNull, departmentId: oidOrNull, email: strOrNull,
    passwordHash: strOrNull,
    ssoId: strOrNull,
    name: str,
    role: { enum: ROLE },
    jobRole: str, managerId: oidOrNull,
    status: { enum: ["invited", "active", "disabled"] },
    lastLoginAt: dateOrNull,
    department: strOrNull, workType: strOrNull, ageRange: strOrNull,
    phishingAwarenessScore: num,
  });

  await make(db, "profiles", ["userId", "orgId"], {
    userId: oid, orgId: oid,
    riskScore: numR(0, 100),
    riskModelVersion: str, riskComputedAt: dateOrNull,
    emotionalVulnerability: { bsonType: "object" },
    cueAccuracy: { bsonType: "object" },
    vectorAccuracy: { bsonType: "object" },
    calibrationScore: num,
    xp: num, level: num, streak: num,
    badges: { bsonType: "array", items: str },
    weakLevers: { bsonType: "array", items: { enum: LEVER } },
  });

  await make(db, "scenarios", ["isPhish", "vector"], {
    orgId: oidOrNull, vector: { enum: VECTOR }, isPhish: { bsonType: "bool" },
    difficulty: numR(1, 5),
    sender: str, subject: str, body: str,
    links: { bsonType: "array", items: linkItem },
    attachments: { bsonType: "array", items: attachmentItem },
    cues: { bsonType: "array", items: cueItem },
    emotionalLevers: { bsonType: "array", items: { enum: LEVER } },
    targetRoles: { bsonType: "array", items: str },
    source: { enum: ["library", "ai_generated"] },
    isActive: { bsonType: "bool" },
    isOnboarding: { bsonType: "bool" },
  });

  await make(db, "lessons", ["vector", "title"], {
    vector: { enum: VECTOR }, title: str,
    steps: { bsonType: "array" },
    redFlags: { bsonType: "array", items: str },
    difficulty: num, order: num,
    isActive: { bsonType: "bool" },
  });

  await make(db, "attempts", ["userId", "orgId", "scenarioId", "verdict", "correct"], {
    userId: oid, orgId: oidOrNull, scenarioId: oid, campaignId: oidOrNull,
    verdict: { enum: ["phish", "legit"] },
    selectedCues: { bsonType: "array", items: { enum: CUE } },
    confidence: numR(0, 100),
    correct: { bsonType: "bool" },
    caughtCues: { bsonType: "array", items: { enum: CUE } },
    missedCues: { bsonType: "array", items: { enum: CUE } },
    falseCues: { bsonType: "array", items: { enum: CUE } },
    explanation: str, calibrationNote: str,
    leversPresent: { bsonType: "array", items: { enum: LEVER } },
    timeToDecideMs: num, xpAwarded: num,
  });

  await make(db, "reviews", ["userId", "orgId", "targetType", "targetValue", "dueAt"], {
    userId: oid, orgId: oid,
    targetType: { enum: ["cueType", "emotionalLever", "vector"] },
    targetValue: str, dueAt: { bsonType: "date" },
    interval: num, easeFactor: num,
    lastReviewedAt: dateOrNull,
  });

  await make(db, "campaigns", ["orgId", "type", "name", "createdBy"], {
    orgId: oid, type: { enum: CAMPAIGN_TYPE }, name: str,
    scenarioIds: { bsonType: "array", items: oid },
    lessonIds: { bsonType: "array", items: oid },
    audience: { bsonType: "object" },
    dueDate: dateOrNull, scheduledAt: dateOrNull,
    status: { enum: ["draft", "scheduled", "active", "completed"] },
    createdBy: oid,
    target: str, requiredScenarios: num,
  });

  await make(db, "assignments", ["campaignId", "userId", "orgId", "status"], {
    campaignId: oid, userId: oid, orgId: oid,
    status: { enum: ASSIGNMENT_STATUS },
    progress: numR(0, 100),
    completedAt: dateOrNull,
  });

  await make(db, "deliveries", ["campaignId", "userId", "orgId", "scenarioId", "outcome"], {
    campaignId: oid, userId: oid, orgId: oid, scenarioId: oid,
    sentAt: { bsonType: "date" },
    openedAt: dateOrNull, clickedAt: dateOrNull, reportedAt: dateOrNull,
    outcome: { enum: DELIVERY_OUTCOME },
  });

  await make(db, "invitations", ["orgId", "email", "token", "status", "invitedBy"], {
    orgId: oid, email: str, role: { enum: ROLE }, departmentId: oidOrNull,
    token: str, status: { enum: INVITATION_STATUS }, invitedBy: oid,
    expiresAt: dateOrNull, acceptedAt: dateOrNull,
  });

  await make(db, "consents", ["userId", "orgId", "policyType", "granted"], {
    userId: oid, orgId: oid, policyType: { enum: CONSENT_TYPE },
    policyVersion: str, granted: { bsonType: "bool" },
    grantedAt: dateOrNull, revokedAt: dateOrNull,
  });

  await make(db, "notifications", ["userId", "orgId", "type", "title"], {
    userId: oid, orgId: oid, type: { enum: NOTIFICATION_TYPE },
    title: str, body: str,
    channel: { enum: ["in_app", "email"] },
    read: { bsonType: "bool" }, sentAt: dateOrNull,
  });

  await make(db, "auditLogs", ["orgId", "actorId", "action"], {
    orgId: oid, actorId: oid, action: str,
    targetType: str, targetId: oidOrNull,
    metadata: { bsonType: "object" }, ip: str,
  });

  await make(db, "surveys", ["title", "purpose", "questions"], {
    orgId: oidOrNull, title: str, description: str,
    purpose: { enum: SURVEY_PURPOSE },
    estimatedMinutes: num,
    isActive: { bsonType: "bool" },
    questions: {
      bsonType: "array",
      items: {
        bsonType: "object",
        required: ["key", "prompt", "type"],
        properties: {
          key: str, prompt: str, type: { enum: SURVEY_Q_TYPE },
          options: { bsonType: "array" },
          mapsTo: { bsonType: "object" },
        },
      },
    },
  });

  await make(db, "surveyResponses", ["surveyId", "userId", "orgId", "answers"], {
    surveyId: oid, userId: oid, orgId: oid,
    answers: {
      bsonType: "array",
      items: {
        bsonType: "object",
        required: ["questionKey", "value"],
        properties: { questionKey: str },
      },
    },
    derivedSignals: { bsonType: "object" },
    baselineRiskContribution: numR(0, 100),
    completedAt: dateOrNull,
  });

  await make(db, "sessions", ["token", "userId", "expiresAt"], {
    token: str, userId: oid, expiresAt: { bsonType: "date" },
  });
}

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("organizations").createIndex(
    { domain: 1 },
    { unique: true, partialFilterExpression: { domain: { $type: "string" } } },
  );

  await db.collection("departments").createIndex({ orgId: 1 });

  await db.collection("users").createIndex(
    { orgId: 1, email: 1 },
    { unique: true, partialFilterExpression: { orgId: { $type: "objectId" }, email: { $type: "string" } } },
  );
  await db.collection("users").createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { orgId: null, email: { $type: "string" } } },
  );
  await db.collection("users").createIndex({ orgId: 1, role: 1 });
  await db.collection("users").createIndex({ departmentId: 1 });

  await db.collection("profiles").createIndex({ userId: 1 }, { unique: true });
  await db.collection("profiles").createIndex({ orgId: 1, riskScore: -1 });

  await db.collection("scenarios").createIndex({ orgId: 1, vector: 1, difficulty: 1 });
  await db.collection("scenarios").createIndex({ emotionalLevers: 1 });

  await db.collection("attempts").createIndex({ userId: 1, createdAt: -1 });
  await db.collection("attempts").createIndex({ campaignId: 1 });

  await db.collection("reviews").createIndex({ userId: 1, dueAt: 1 });

  await db.collection("campaigns").createIndex({ orgId: 1, status: 1 });

  await db.collection("assignments").createIndex({ userId: 1, status: 1 });
  await db.collection("assignments").createIndex({ campaignId: 1 });

  await db.collection("deliveries").createIndex({ campaignId: 1 });
  await db.collection("deliveries").createIndex({ userId: 1 });

  await db.collection("invitations").createIndex({ token: 1 }, { unique: true });
  await db.collection("invitations").createIndex({ orgId: 1, status: 1 });

  await db.collection("consents").createIndex({ userId: 1, policyType: 1 });

  await db.collection("notifications").createIndex({ userId: 1, read: 1, createdAt: -1 });

  await db.collection("auditLogs").createIndex({ orgId: 1, createdAt: -1 });

  await db.collection("surveys").createIndex({ orgId: 1, purpose: 1, isActive: 1 });

  await db.collection("surveyResponses").createIndex({ userId: 1, surveyId: 1 }, { unique: true });
  await db.collection("surveyResponses").createIndex({ orgId: 1, surveyId: 1 });

  await db.collection("sessions").createIndex({ token: 1 }, { unique: true });
  await db.collection("sessions").createIndex({ userId: 1 });
  await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  await Promise.all(
    Object.entries(PK).map(([collection, pk]) =>
      db.collection(collection).createIndex({ [pk]: 1 }, { unique: true, name: `${pk}_pk` }),
    ),
  );
}

export async function provisionDatabase(db: Db): Promise<void> {
  await ensureSchema(db);
  await ensureIndexes(db);
}
