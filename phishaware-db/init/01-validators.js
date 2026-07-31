/**
 * 01-validators.js
 * Creates/updates all 18 collections (17 shared + app-internal `sessions`)
 * WITH $jsonSchema validators. Safe to re-run against an already-provisioned
 * cluster (uses collMod for existing collections). Runs automatically on
 * first `docker compose up`, or manually:
 *   mongosh "<uri>" init/01-validators.js
 *
 * Foolproofing principle: MongoDB is schemaless by default. These validators
 * make the DATABASE itself reject documents with wrong types, bad enums, or
 * missing required fields — so a buggy API route can't silently corrupt data.
 * validationAction:"error" => bad writes are rejected, not just warned.
 *
 * Two deliberate departures from the shared team spec, both scoped to this
 * app's real product needs (a public consumer app with a guest mode, not a
 * purely B2B always-in-an-org product):
 *   - users.orgId / users.email / attempts.orgId are nullable (the spec says
 *     required-non-null). Guests have no email; consumer signups and guests
 *     have no org until they create/join one. The `required` key is still
 *     satisfied (present, value may be null) -- every other spec convention
 *     is unchanged.
 *   - scenarios.isOnboarding: bool is kept as an extra, spec-unlisted field
 *     (picks the 5 onboarding-quiz questions) -- allowed since these
 *     validators never set `additionalProperties:false`.
 */
db = db.getSiblingDB("phishaware");

// ---- shared enums (single source of truth) ----
const ROLE = ["admin", "manager", "employee"];
const VECTOR = ["email", "sms", "voice", "qr", "social", "web"];
const LEVER = ["urgency", "curiosity", "authority", "fear", "reward", "trust", "scarcity", "social_proof"];
const CUE = ["sender_domain", "mismatched_link", "urgency_language",
  "generic_greeting", "credential_request", "spelling_grammar",
  "unexpected_attachment", "suspicious_qr"];
const CAMPAIGN_TYPE = ["training", "mandatory", "surprise_test"];
const ASSIGNMENT_STATUS = ["assigned", "in_progress", "completed", "overdue"];
const DELIVERY_OUTCOME = ["pending", "opened", "clicked", "reported", "ignored"];
const INVITATION_STATUS = ["pending", "accepted", "expired", "revoked"];
const CONSENT_TYPE = ["emotional_profiling", "data_processing"];
const NOTIFICATION_TYPE = ["assignment", "reminder", "result", "system", "survey"];
const SURVEY_PURPOSE = ["onboarding_baseline", "periodic_pulse"];
const SURVEY_Q_TYPE = ["likert_1_5", "single_choice", "multi_choice", "boolean"];

// Each collection's PARTICULAR primary key (named per entity, not generic
// _id). Value mirrors _id; see 02-indexes.js for the matching unique index.
// `sessions` has no named PK -- it's app-internal (auth), not part of the
// shared cross-team schema.
const PK = {
  organizations: "orgId", departments: "departmentId", users: "userId",
  profiles: "profileId", scenarios: "scenarioId", lessons: "lessonId",
  attempts: "attemptId", reviews: "reviewId", campaigns: "campaignId",
  assignments: "assignmentId", deliveries: "deliveryId", invitations: "invitationId",
  consents: "consentId", notifications: "notificationId", auditLogs: "auditLogId",
  surveys: "surveyId", surveyResponses: "surveyResponseId",
};

const oid = { bsonType: "objectId" };
const oidOrNull = { bsonType: ["objectId", "null"] };
const str = { bsonType: "string" };
const strOrNull = { bsonType: ["string", "null"] };
const dateOrNull = { bsonType: ["date", "null"] };
// Any number: the Node driver can send a whole-valued JS number as either
// BSON int32 or double depending on the value/driver internals -- accept all
// three so normal app writes are never rejected on numeric type alone.
const num = { bsonType: ["int", "long", "double"] };
const numR = (min, max) => ({ bsonType: ["int", "long", "double"], minimum: min, maximum: max });

// helper: build a validator. `required` fields must exist; named `props` are
// type/enum-checked; unlisted fields are allowed (no additionalProperties:
// false anywhere in this file). Auto-injects the named PK (mirrors _id) plus
// metadata/createdAt/updatedAt/deletedAt on every collection. Uses collMod
// for collections that already exist (safe to re-run against a live,
// already-provisioned cluster) and createCollection otherwise.
// lessons keep a string slug as _id (e.g. "email-phishing") for pretty
// /learn/[id] URLs, so their named PK mirrors that type instead of ObjectId
// -- everything else's PK is an ObjectId mirroring _id as normal.
const PK_TYPE = { lessons: str };

function make(name, required, props) {
  const pk = PK[name];
  const properties = Object.assign(
    {
      metadata: { bsonType: "object" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
      deletedAt: dateOrNull,
    },
    props,
  );
  const req = required.slice();
  if (pk) {
    properties[pk] = PK_TYPE[name] || oid;
    req.unshift(pk);
  }
  const validator = { $jsonSchema: { bsonType: "object", required: req, properties } };
  if (db.getCollectionNames().includes(name)) {
    db.runCommand({ collMod: name, validator, validationLevel: "moderate", validationAction: "error" });
    print("  updated validator for " + name + (pk ? " (pk: " + pk + ")" : ""));
  } else {
    db.createCollection(name, { validator, validationLevel: "moderate", validationAction: "error" });
    print("  created " + name + (pk ? " (pk: " + pk + ")" : ""));
  }
}

// ================= Group A — learning & profiling core =================

make("organizations", ["name", "domain"], {
  name: str, domain: strOrNull, // nullable: blank/invite-only orgs
  ssoProvider: strOrNull,
  settings: { bsonType: "object" },
});

make("departments", ["orgId", "name"], {
  orgId: oid, name: str, parentId: oidOrNull, managerId: oidOrNull,
});

make("users", ["orgId", "email", "name", "role"], {
  // orgId/email nullable -- see file header note.
  orgId: oidOrNull, departmentId: oidOrNull, email: strOrNull,
  passwordHash: strOrNull,
  ssoId: strOrNull,
  name: str,
  role: { enum: ROLE },
  jobRole: str, managerId: oidOrNull,
  status: { enum: ["invited", "active", "disabled"] },
  lastLoginAt: dateOrNull,
  // App-specific, spec-unlisted (like isOnboarding on scenarios): self-reported
  // from the onboarding survey, used to target generated phishing scenarios.
  // Distinct from departmentId above, which is the org's formal department
  // directory FK -- these are freeform/enum labels for content personalization,
  // not org structure.
  department: strOrNull, workType: strOrNull, ageRange: strOrNull,
  phishingAwarenessScore: num,
});

make("profiles", ["userId", "orgId"], {
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

const linkItem = {
  bsonType: "object",
  required: ["text", "isSuspicious"],
  properties: { text: str, isSuspicious: { bsonType: "bool" } },
};
const attachmentItem = {
  bsonType: "object",
  required: ["name", "isSuspicious"],
  properties: { name: str, isSuspicious: { bsonType: "bool" } },
};
const cueItem = {
  bsonType: "object",
  required: ["type", "severity", "explanation"],
  properties: { type: { enum: CUE }, severity: num, explanation: str },
};

make("scenarios", ["isPhish", "vector"], {
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
  isOnboarding: { bsonType: "bool" }, // extra, spec-unlisted -- see file header note
});

make("lessons", ["vector", "title"], {
  vector: { enum: VECTOR }, title: str,
  steps: { bsonType: "array" },
  redFlags: { bsonType: "array", items: str },
  difficulty: num, order: num,
  isActive: { bsonType: "bool" },
});

make("attempts", ["userId", "orgId", "scenarioId", "verdict", "correct"], {
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

make("reviews", ["userId", "orgId", "targetType", "targetValue", "dueAt"], {
  userId: oid, orgId: oid,
  targetType: { enum: ["cueType", "emotionalLever", "vector"] },
  targetValue: str, dueAt: { bsonType: "date" },
  interval: num, easeFactor: num,
  lastReviewedAt: dateOrNull,
});

// ================= Group B — operations & compliance =================

make("campaigns", ["orgId", "type", "name", "createdBy"], {
  orgId: oid, type: { enum: CAMPAIGN_TYPE }, name: str,
  scenarioIds: { bsonType: "array", items: oid },
  lessonIds: { bsonType: "array", items: oid },
  audience: { bsonType: "object" },
  dueDate: dateOrNull, scheduledAt: dateOrNull,
  status: { enum: ["draft", "scheduled", "active", "completed"] },
  createdBy: oid,
  // Extra, spec-unlisted fields used by this app's training-assignment UI.
  target: str, requiredScenarios: num,
});

make("assignments", ["campaignId", "userId", "orgId", "status"], {
  campaignId: oid, userId: oid, orgId: oid,
  status: { enum: ASSIGNMENT_STATUS },
  progress: numR(0, 100),
  completedAt: dateOrNull,
});

make("deliveries", ["campaignId", "userId", "orgId", "scenarioId", "outcome"], {
  campaignId: oid, userId: oid, orgId: oid, scenarioId: oid,
  sentAt: { bsonType: "date" },
  openedAt: dateOrNull, clickedAt: dateOrNull, reportedAt: dateOrNull,
  outcome: { enum: DELIVERY_OUTCOME },
});

make("invitations", ["orgId", "email", "token", "status", "invitedBy"], {
  orgId: oid, email: str, role: { enum: ROLE }, departmentId: oidOrNull,
  token: str, status: { enum: INVITATION_STATUS }, invitedBy: oid,
  expiresAt: dateOrNull, acceptedAt: dateOrNull,
});

make("consents", ["userId", "orgId", "policyType", "granted"], {
  userId: oid, orgId: oid, policyType: { enum: CONSENT_TYPE },
  policyVersion: str, granted: { bsonType: "bool" },
  grantedAt: dateOrNull, revokedAt: dateOrNull,
});

make("notifications", ["userId", "orgId", "type", "title"], {
  userId: oid, orgId: oid, type: { enum: NOTIFICATION_TYPE },
  title: str, body: str,
  channel: { enum: ["in_app", "email"] },
  read: { bsonType: "bool" }, sentAt: dateOrNull,
});

make("auditLogs", ["orgId", "actorId", "action"], {
  orgId: oid, actorId: oid, action: str,
  targetType: str, targetId: oidOrNull,
  metadata: { bsonType: "object" }, ip: str,
});

// ================= Onboarding survey =================

make("surveys", ["title", "purpose", "questions"], {
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

make("surveyResponses", ["surveyId", "userId", "orgId", "answers"], {
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

// ================= App-internal — auth sessions =================
// Not part of the shared cross-team schema (no named PK) -- mirrors the
// app's session-cookie mechanism exactly.

make("sessions", ["token", "userId", "expiresAt"], {
  token: str, userId: oid, expiresAt: { bsonType: "date" },
});

print("\n[01-validators] all 18 collections created/updated with schema validation.");
