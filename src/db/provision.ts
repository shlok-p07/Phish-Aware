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
import type { CreateIndexesOptions, Db, Document, IndexSpecification } from "mongodb";
import { WORK_MODES } from "@/lib/onboarding-survey";

type Schema = Document;

const ROLE = ["admin", "manager", "employee"];
const WORK_TYPE = [...WORK_MODES];
const VECTOR = ["email", "sms", "voice", "qr", "social", "web"];
const LEVER = ["urgency", "curiosity", "authority", "fear", "reward", "trust", "scarcity", "social_proof"];
const ATTACK_TYPE = [
  "credential_harvesting", "bec", "invoice_fraud", "payroll_fraud",
  "mfa_fatigue", "cloud_file_sharing_scam", "it_helpdesk_scam",
  "package_delivery_scam", "software_update_scam", "malware_delivery",
];
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

const PK: Record<string, string> = {
  organizations: "orgId", departments: "departmentId", users: "userId",
  scenarios: "scenarioId", lessons: "lessonId",
  lessonCompletions: "lessonCompletionId",
  attempts: "attemptId", reviews: "reviewId", campaigns: "campaignId",
  assignments: "assignmentId", deliveries: "deliveryId", invitations: "invitationId",
  consents: "consentId", notifications: "notificationId", auditLogs: "auditLogId",
  surveyResponses: "surveyResponseId",
  // App-internal, but it follows the named-PK convention. ssoStates does not,
  // for the same reason sessions doesn't: transient and not part of the spec.
  ssoConnections: "ssoConnectionId",
};

const SSO_PROVIDER_KIND = ["okta", "entra", "google", "auth0", "generic"];

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
    isDemo: { bsonType: "bool" },
    lastLoginAt: dateOrNull,
    // Deliberately a string, not the enum. Departments are organization-owned
    // records now (src/server/departments.ts), so a customer's own department
    // name is legitimate and an enum here would reject it at insert time. The
    // API validates against that organization's departments instead, which is
    // the only place that knows what they are. workType stays an enum -- it is a
    // survey answer with three fixed values, not customer data.
    department: strOrNull,
    workType: { enum: [...WORK_TYPE, null] },
    surveyFeatures: { bsonType: ["object", "null"] },
    phishingAwarenessScore: num,
    phishingAwarenessModelVersion: strOrNull,
    phishingAwarenessComputedAt: dateOrNull,
  });


  await make(db, "scenarios", ["isPhish", "vector"], {
    orgId: oidOrNull, vector: { enum: VECTOR }, isPhish: { bsonType: "bool" },
    difficulty: numR(1, 5),
    sender: str, subject: str, body: str,
    links: { bsonType: "array", items: linkItem },
    attachments: { bsonType: "array", items: attachmentItem },
    cues: { bsonType: "array", items: cueItem },
    emotionalLevers: { bsonType: "array", items: { enum: LEVER } },
    attackType: { enum: ATTACK_TYPE },
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
    attackType: { enum: ATTACK_TYPE },
    timeToDecideMs: num, xpAwarded: num,
  });

  // orgId nullable: a self-signup learner still deserves a review schedule, and
  // the original required objectId could not represent one at all. `streak` is an
  // addition -- consecutive successes are what "mastered" is counted from.
  // orgId nullable: a self-signup learner works through the same library.
  await make(db, "lessonCompletions", ["userId", "lessonId", "completedAt"], {
    // lessonId is a slug, matching lessons._id, not an ObjectId.
    userId: oid, lessonId: str, orgId: oidOrNull,
    completedAt: { bsonType: "date" },
  });

  await make(db, "reviews", ["userId", "targetType", "targetValue", "dueAt"], {
    userId: oid, orgId: oidOrNull,
    targetType: { enum: ["cueType", "emotionalLever", "vector"] },
    targetValue: str, dueAt: { bsonType: "date" },
    interval: num, easeFactor: num,
    lastReviewedAt: dateOrNull,
    streak: num,
  });

  await make(db, "campaigns", ["orgId", "type", "name", "createdBy"], {
    orgId: oid, type: { enum: CAMPAIGN_TYPE }, name: str,
    scenarioIds: { bsonType: "array", items: oid },
    lessonIds: { bsonType: "array", items: oid },
    audience: { bsonType: "object" },
    dueDate: dateOrNull, scheduledAt: dateOrNull,
    status: { enum: ["draft", "scheduled", "active", "completed"] },
    createdBy: oid,
    // What the campaign trains, or null for "any practice counts".
    focus: {
      bsonType: ["object", "null"],
      properties: {
        vectors: { bsonType: "array", items: str },
        minDifficulty: num,
        cues: { bsonType: "array", items: str },
      },
    },
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

  // `name` and `acceptedUserId` are app extras beyond the shared spec.
  await make(db, "invitations", ["orgId", "email", "token", "status", "invitedBy"], {
    orgId: oid, email: str, role: { enum: ROLE }, departmentId: oidOrNull,
    department: strOrNull,
    token: str, status: { enum: INVITATION_STATUS }, invitedBy: oid,
    expiresAt: dateOrNull, acceptedAt: dateOrNull,
    name: strOrNull, acceptedUserId: oidOrNull,
  });

  // orgId is nullable and not required: a self-signup user consents to the same
  // processing with no organization to answer to, and the original schema could
  // not represent that at all.
  await make(db, "consents", ["userId", "policyType", "granted"], {
    userId: oid, orgId: oidOrNull, policyType: { enum: CONSENT_TYPE },
    policyVersion: str, granted: { bsonType: "bool" },
    grantedAt: dateOrNull, revokedAt: dateOrNull,
  });

  await make(db, "notifications", ["userId", "orgId", "type", "title"], {
    userId: oid, orgId: oid, type: { enum: NOTIFICATION_TYPE },
    title: str, body: str,
    channel: { enum: ["in_app", "email"] },
    read: { bsonType: "bool" }, sentAt: dateOrNull,
    // What the notification is about, so one can be deduplicated per subject
    // rather than re-sent on every sweep.
    subjectId: oidOrNull,
  });

  await make(db, "auditLogs", ["orgId", "actorId", "action"], {
    orgId: oid, actorId: oid, action: str,
    targetType: str, targetId: oidOrNull,
    metadata: { bsonType: "object" }, ip: str,
  });


  // Identified by a key and version rather than a surveyId into a `surveys`
  // collection. The questionnaire is defined in src/lib/onboarding-survey.ts --
  // question wording, ordering and scoring are code -- so a database copy would
  // be a second source of truth that could silently disagree with the form the
  // learner actually filled in. The version pins which wording produced these
  // answers, which is what makes an old response still interpretable.
  //
  // orgId nullable so a self-signup learner's answers are kept too.
  await make(db, "surveyResponses", ["surveyKey", "surveyVersion", "userId", "answers"], {
    surveyKey: str, surveyVersion: str,
    purpose: { enum: SURVEY_PURPOSE },
    userId: oid, orgId: oidOrNull,
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

  // ===== App-internal -- SSO (not part of the shared cross-team spec) =====

  await make(db, "ssoConnections", ["orgId", "issuer", "clientId", "clientSecretEnc", "enabled"], {
    orgId: oid, providerKind: { enum: SSO_PROVIDER_KIND },
    issuer: str, clientId: str, clientSecretEnc: str,
    extraScopes: { bsonType: "array", items: str },
    allowedDomains: { bsonType: "array", items: str },
    requireVerifiedEmail: { bsonType: "bool" }, enabled: { bsonType: "bool" },
    discovery: { bsonType: ["object", "null"] }, discoveryFetchedAt: dateOrNull,
    lastTestAt: dateOrNull, lastTestOk: { bsonType: ["bool", "null"] },
    lastTestError: strOrNull, configVersion: num,
  });

  await make(db, "ssoStates", ["state", "nonce", "codeVerifier", "orgId", "expiresAt"], {
    state: str, nonce: str, codeVerifier: str, orgId: oid, connectionId: oid,
    redirectTo: str, emailHint: strOrNull, isTest: { bsonType: "bool" },
    expiresAt: { bsonType: "date" },
  });
}

export async function ensureIndexes(db: Db): Promise<void> {
  // Every index this function creates, by collection, so drift can be reported
  // against it below.
  const desired = new Map<string, Set<string>>();
  const index = async (
    collection: string,
    keys: IndexSpecification,
    options?: CreateIndexesOptions,
  ): Promise<void> => {
    const name = await db.collection(collection).createIndex(keys, options);
    const names = desired.get(collection) ?? new Set<string>();
    names.add(name);
    desired.set(collection, names);
  };

  await index("organizations", 
    { domain: 1 },
    { unique: true, partialFilterExpression: { domain: { $type: "string" } } },
  );

  // One department per name per organisation, compared the way the code compares
  // it: strength 2 is case-insensitive, so "Finance" and "finance" collide here
  // exactly as findOrgDepartment already treats them as the same department.
  //
  // Without this, ensureOrgDepartments' read-then-insert had nothing to stop a
  // concurrent caller inserting the same set again, and one organisation ended
  // up with all ten of its departments twice.
  //
  // Tolerated rather than fatal: an existing cluster may already hold duplicates,
  // and a data problem should not stop the app booting. The message names the fix.
  try {
    await index(
      "departments",
      { orgId: 1, name: 1 },
      { unique: true, collation: { locale: "en", strength: 2 }, name: "orgId_1_name_1_ci" },
    );
  } catch (cause) {
    const code = (cause as { code?: number }).code;
    // 11000 duplicate key, 85 IndexOptionsConflict, 86 IndexKeySpecsConflict.
    if (code !== 11000 && code !== 85 && code !== 86) throw cause;
    console.warn(
      "[db] departments has duplicate (orgId, name) rows, so the unique index was " +
        "not created. Run: bun run scripts/dedupe-departments.ts",
    );
  }
  await index("departments", { orgId: 1 });

  await index("users", 
    { orgId: 1, email: 1 },
    { unique: true, partialFilterExpression: { orgId: { $type: "objectId" }, email: { $type: "string" } } },
  );
  await index("users", 
    { email: 1 },
    { unique: true, partialFilterExpression: { orgId: null, email: { $type: "string" } } },
  );
  await index("users", { orgId: 1, role: 1 });
  await index("users", { departmentId: 1 });

  await index("scenarios", { orgId: 1, vector: 1, difficulty: 1 });
  await index("scenarios", { emotionalLevers: 1 });

  await index("attempts", { userId: 1, createdAt: -1 });
  await index("attempts", { userId: 1, attackType: 1, createdAt: -1 });
  await index("attempts", { userId: 1, leversPresent: 1, createdAt: -1 });
  await index("attempts", { campaignId: 1 });

  // One row per learner per target. Without this, two attempts landing together
  // could each miss the other's upsert and create a duplicate schedule for the
  // same red flag -- and then "mastered" would be counted twice.
  // Unique so re-reading upserts rather than piling up rows.
  await index("lessonCompletions", { userId: 1, lessonId: 1 }, { unique: true });
  await index("lessonCompletions", { orgId: 1, lessonId: 1 });

  await index("reviews", { userId: 1, targetType: 1, targetValue: 1 }, { unique: true });
  await index("reviews", { userId: 1, dueAt: 1 });

  await index("campaigns", { orgId: 1, status: 1 });

  await index("assignments", { userId: 1, status: 1 });
  await index("assignments", { campaignId: 1 });

  await index("deliveries", { campaignId: 1 });
  await index("deliveries", { userId: 1 });

  await index("invitations", { token: 1 }, { unique: true });
  await index("invitations", { orgId: 1, status: 1 });
  // At most one live invitation per address per org. Re-inviting someone whose
  // earlier invitation was revoked or accepted stays allowed.
  await index("invitations", 
    { orgId: 1, email: 1 },
    { unique: true, partialFilterExpression: { status: "pending" } },
  );
  // The SSO callback's lookup: "is this address invited anywhere?"
  await index("invitations", { email: 1, status: 1 });
  // Deliberately no TTL on expiresAt -- expired invitations must stay
  // queryable for the audit trail. Expiry is computed (see invitationState).

  await index("consents", { userId: 1, policyType: 1 });

  await index("notifications", { userId: 1, read: 1, createdAt: -1 });

  await index("auditLogs", { orgId: 1, createdAt: -1 });

  // Deliberately not unique on (userId, surveyKey): keeping every submission is
  // the point, so a retake adds a row rather than overwriting the answers that
  // produced the score the learner was originally placed on.
  await index("surveyResponses", { userId: 1, surveyKey: 1, createdAt: -1 });
  await index("surveyResponses", { orgId: 1, surveyKey: 1, createdAt: -1 });

  await index("sessions", { token: 1 }, { unique: true });
  await index("sessions", { userId: 1 });
  await index("sessions", { expiresAt: 1 }, { expireAfterSeconds: 0 });

  await index("ssoConnections", { orgId: 1 });
  // One live connection per org, and one org per email domain. Both are scoped
  // to enabled:true so a domain can move to another org once the first is
  // disabled -- and so several draft connections can coexist without their
  // empty allowedDomains arrays colliding in the unique multikey index.
  // Explicitly named: same key as the plain orgId index above, so the
  // auto-generated name would collide with it (IndexKeySpecsConflict).
  await index("ssoConnections", 
    { orgId: 1 },
    {
      unique: true,
      partialFilterExpression: { enabled: true },
      name: "orgId_1_enabled_unique",
    },
  );
  await index("ssoConnections", 
    { allowedDomains: 1 },
    {
      unique: true,
      partialFilterExpression: { enabled: true },
      name: "allowedDomains_1_enabled_unique",
    },
  );

  await index("ssoStates", { state: 1 }, { unique: true });
  // Mongo's TTL monitor only runs about once a minute, so the callback checks
  // expiresAt in code too. This is cleanup, not enforcement.
  await index("ssoStates", { expiresAt: 1 }, { expireAfterSeconds: 0 });

  await Promise.all(
    Object.entries(PK).map(([collection, pk]) =>
      index(collection, { [pk]: 1 }, { unique: true, name: `${pk}_pk` }),
    ),
  );

  await pruneStaleIndexes(db);
  reportIndexDrift(db, desired);
}

/**
 * Indexes that were provisioned by an earlier version of this file and are now
 * wrong, not merely unused.
 *
 * createIndex is additive: deleting a line here leaves the index in the database
 * forever. That is how surveyResponses ended up with a unique index on
 * (userId, surveyId) after surveyId was replaced by surveyKey -- every new
 * document indexed that field as null, so a learner could hold exactly one
 * survey response and the second insert failed with a duplicate key. Retakes
 * were meant to be kept.
 */
const STALE_INDEXES: Record<string, string[]> = {
  surveyResponses: ["userId_1_surveyId_1", "orgId_1_surveyId_1"],
};

async function pruneStaleIndexes(db: Db): Promise<void> {
  for (const [collection, names] of Object.entries(STALE_INDEXES)) {
    for (const name of names) {
      try {
        await db.collection(collection).dropIndex(name);
        console.warn(`[db] dropped stale index ${collection}.${name}`);
      } catch (cause) {
        // IndexNotFound (27) is the expected outcome on any cluster provisioned
        // after the index was removed, and on every run after the first.
        if ((cause as { code?: number }).code !== 27) throw cause;
      }
    }
  }
}

/**
 * Logs any index this file does not create, without touching it.
 *
 * Deliberately not a reconcile-and-drop: the cluster is shared, and silently
 * dropping an index another team added would be worse than leaving it. Anything
 * genuinely wrong goes in STALE_INDEXES, where it is named and reviewable.
 * Fire-and-forget so a reporting query cannot slow down or fail startup.
 */
function reportIndexDrift(db: Db, desired: Map<string, Set<string>>): void {
  void (async () => {
    try {
      for (const [collection, names] of desired) {
        const actual = await db.collection(collection).indexes();
        const unexpected = actual
          .map((ix) => ix.name)
          .filter((name): name is string => !!name && name !== "_id_" && !names.has(name));
        if (unexpected.length > 0) {
          console.warn(`[db] ${collection} has unmanaged indexes: ${unexpected.join(", ")}`);
        }
      }
    } catch (cause) {
      console.warn("[db] could not check for index drift", cause);
    }
  })();
}

export async function provisionDatabase(db: Db): Promise<void> {
  await ensureSchema(db);
  await ensureIndexes(db);
}
