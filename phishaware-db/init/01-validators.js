/**
 * 01-validators.js
 * Creates all 17 collections WITH $jsonSchema validators.
 * Runs automatically on first `docker compose up`, or manually:
 *   mongosh "<uri>" init/01-validators.js
 *
 * Foolproofing principle: MongoDB is schemaless by default. These validators
 * make the DATABASE itself reject documents with wrong types, bad enums, or
 * missing required fields — so a buggy API route can't silently corrupt data.
 * validationAction:"error" => bad writes are rejected, not just warned.
 */
db = db.getSiblingDB("phishaware");

// ---- shared enums (single source of truth) ----
// CUE and VECTOR mirror the PhishAware app's real vocabulary exactly
// (src/server/cues.ts / src/server/lessons.ts) rather than an independent
// enterprise vocabulary, so the app's writes never get rejected.
const ROLE = ["admin", "manager", "employee"];
const VECTOR = ["email", "sms", "voice", "qr", "social", "website"];
const LEVER = ["urgency", "curiosity", "authority", "fear", "reward", "trust"];
const CUE = ["mismatched_domain", "urgency", "generic_greeting", "suspicious_link",
  "credential_request", "spelling_errors", "too_good_to_be_true", "unexpected_attachment",
  "impersonal_tone", "threat_language", "unusual_request", "mismatched_display_name"];
const CAMPAIGN_TYPE = ["training", "mandatory", "surprise_test"];
const ASSIGNMENT_STATUS = ["assigned", "in_progress", "completed", "overdue"];
const DELIVERY_OUTCOME = ["pending", "opened", "clicked", "reported", "ignored"];
const INVITATION_STATUS = ["pending", "accepted", "expired", "revoked"];
const CONSENT_TYPE = ["emotional_profiling", "data_processing"];
const NOTIFICATION_TYPE = ["assignment", "reminder", "result", "system", "survey"];
const SURVEY_PURPOSE = ["onboarding_baseline", "periodic_pulse"];
const SURVEY_Q_TYPE = ["likert_1_5", "single_choice", "multi_choice", "boolean"];

// helper: build a validator. `required` fields must exist; named `props` are
// type/enum-checked; unlisted fields (createdAt, updatedAt, etc.) are allowed.
// Uses collMod for collections that already exist (safe to re-run against a
// live, already-provisioned cluster) and createCollection otherwise.
function make(name, required, props) {
  const validator = {
    $jsonSchema: {
      bsonType: "object",
      required: required,
      properties: props,
    },
  };
  if (db.getCollectionNames().includes(name)) {
    db.runCommand({
      collMod: name,
      validator: validator,
      validationLevel: "moderate",
      validationAction: "error",
    });
    print("  updated validator for " + name);
  } else {
    db.createCollection(name, {
      validator: validator,
      validationLevel: "moderate",   // only validate inserts + modified docs
      validationAction: "error",     // reject invalid writes
    });
    print("  created " + name);
  }
}

const oid = { bsonType: "objectId" };
const oidOrNull = { bsonType: ["objectId", "null"] };
const str = { bsonType: "string" };
const dateOrNull = { bsonType: ["date", "null"] };

// ================= Group A — learning & profiling core =================

make("organizations", ["name", "domain"], {
  // domain is nullable: the create-org form allows leaving SSO domain blank
  // (invite-only org) — see the partial unique index in 02-indexes.js.
  name: str, domain: { bsonType: ["string", "null"] },
  ssoProvider: { bsonType: ["string", "null"] },
  settings: { bsonType: "object" },
});

make("departments", ["orgId", "name"], {
  orgId: oid, name: str, parentId: oidOrNull, managerId: oidOrNull,
});

make("users", ["orgId", "email", "name", "role"], {
  // orgId/email are nullable: consumer signups and guests start orgless
  // (matching the app's real single-tenant-by-default behavior), and guests
  // have no email at all. Both keys stay required-present, just null-valued.
  orgId: oidOrNull, departmentId: oidOrNull, email: { bsonType: ["string", "null"] },
  passwordHash: { bsonType: ["string", "null"] },
  ssoId: { bsonType: ["string", "null"] },
  name: str,
  role: { enum: ROLE },
  jobRole: str, managerId: oidOrNull,
  status: { enum: ["invited", "active", "disabled"] },
  lastLoginAt: dateOrNull,
});

make("profiles", ["userId", "orgId"], {
  userId: oid, orgId: oid,
  riskScore: { bsonType: ["double", "int", "long"], minimum: 0, maximum: 100 },
  riskModelVersion: str, riskComputedAt: dateOrNull,
  emotionalVulnerability: { bsonType: "object" },
  cueAccuracy: { bsonType: "object" },
  vectorAccuracy: { bsonType: "object" },
  calibrationScore: { bsonType: ["double", "int", "long"] },
  xp: { bsonType: "int" }, level: { bsonType: "int" }, streak: { bsonType: "int" },
  badges: { bsonType: "array", items: str },
  weakLevers: { bsonType: "array", items: { enum: LEVER } },
});

make("scenarios", ["isPhish", "vector"], {
  orgId: oidOrNull, vector: { enum: VECTOR }, isPhish: { bsonType: "bool" },
  // difficulty is free text ("easy"/"medium"/"hard"), matching the app's
  // scenariosTable.difficulty column rather than a numeric 1-5 scale.
  difficulty: str,
  sender: str, subject: str, body: str,
  links: { bsonType: "array" }, attachments: { bsonType: "array" },
  cues: { bsonType: "array" },
  emotionalLevers: { bsonType: "array", items: { enum: LEVER } },
  targetRoles: { bsonType: "array", items: str },
  source: { enum: ["library", "ai_generated"] },
  isActive: { bsonType: "bool" },
});

make("lessons", ["vector", "title"], {
  vector: { enum: VECTOR }, title: str,
  steps: { bsonType: "array" },
  redFlags: { bsonType: "array", items: str },
  difficulty: { bsonType: "int" }, order: { bsonType: "int" },
  isActive: { bsonType: "bool" },
});

make("attempts", ["userId", "orgId", "scenarioId", "userVerdict", "correct"], {
  // orgId is nullable: guest/orgless practice attempts still validate.
  // userVerdict (bool) matches the app's attemptsTable.userVerdict column —
  // the app has no separate "phish"/"legit" enum concept.
  userId: oid, orgId: oidOrNull, scenarioId: oid, campaignId: oidOrNull,
  userVerdict: { bsonType: "bool" },
  selectedCues: { bsonType: "array", items: { enum: CUE } },
  confidence: { bsonType: "int", minimum: 0, maximum: 100 },
  correct: { bsonType: "bool" },
  caughtCues: { bsonType: "array", items: { enum: CUE } },
  missedCues: { bsonType: "array", items: { enum: CUE } },
  falseCues: { bsonType: "array", items: { enum: CUE } },
  explanation: str, calibrationNote: str,
  leversPresent: { bsonType: "array", items: { enum: LEVER } },
  timeToDecideMs: { bsonType: "int" }, xpAwarded: { bsonType: "int" },
});

make("reviews", ["userId", "orgId", "targetType", "targetValue", "dueAt"], {
  userId: oid, orgId: oid,
  targetType: { enum: ["cueType", "emotionalLever", "vector"] },
  targetValue: str, dueAt: { bsonType: "date" },
  interval: { bsonType: ["double", "int", "long"] },
  easeFactor: { bsonType: ["double", "int", "long"] },
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
});

make("assignments", ["campaignId", "userId", "orgId", "status"], {
  campaignId: oid, userId: oid, orgId: oid,
  status: { enum: ASSIGNMENT_STATUS },
  progress: { bsonType: "int", minimum: 0, maximum: 100 },
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

// ================= NEW — onboarding survey =================

make("surveys", ["title", "purpose", "questions"], {
  orgId: oidOrNull, title: str, description: str,
  purpose: { enum: SURVEY_PURPOSE },
  estimatedMinutes: { bsonType: "int" },
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
  baselineRiskContribution: { bsonType: ["double", "int", "long"], minimum: 0, maximum: 100 },
  completedAt: dateOrNull,
});

// ================= NEW — app auth sessions =================
// Mirrors the app's Postgres sessionsTable exactly: an opaque cookie token
// mapped to a user, with an expiry the app lazily checks (backed by a native
// TTL index in 02-indexes.js as a hard backstop).

make("sessions", ["token", "userId", "expiresAt"], {
  token: str, userId: oid, expiresAt: { bsonType: "date" },
});

print("\n[01-validators] all 18 collections created with schema validation.");
