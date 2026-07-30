/**
 * 02-indexes.js
 * Every foreign key used in a query is indexed, plus the unique constraints
 * that keep data honest (one profile per user, one email per org, etc.), and
 * a unique index on each collection's named primary key (mirrors _id).
 * createIndex is idempotent — safe to re-run.
 */
db = db.getSiblingDB("phishaware");

// organizations
// domain is nullable (blank/invite-only orgs) — a plain unique index would
// treat every null domain as an equal key and reject the second blank-domain
// org. Scope uniqueness to orgs that actually set a domain.
db.organizations.createIndex(
  { domain: 1 },
  { unique: true, partialFilterExpression: { domain: { $type: "string" } } },
);

// departments
db.departments.createIndex({ orgId: 1 });

// users
// orgId/email are both nullable (guests, orgless signups). A plain compound
// unique index treats null/missing as an equal key across documents, so the
// FIRST guest or orgless signup would succeed and every subsequent one would
// throw a duplicate-key error. Two partial indexes instead:
//  - real org members: unique email per org
//  - orgless signed-up users: unique email globally
// Guests (email: null) match neither filter, so unlimited guests can coexist.
db.users.createIndex(
  { orgId: 1, email: 1 },
  { unique: true, partialFilterExpression: { orgId: { $type: "objectId" }, email: { $type: "string" } } },
);
db.users.createIndex(
  { email: 1 },
  { unique: true, partialFilterExpression: { orgId: null, email: { $type: "string" } } },
);
db.users.createIndex({ orgId: 1, role: 1 });
db.users.createIndex({ departmentId: 1 });

// profiles
db.profiles.createIndex({ userId: 1 }, { unique: true });
db.profiles.createIndex({ orgId: 1, riskScore: -1 });

// scenarios
db.scenarios.createIndex({ orgId: 1, vector: 1, difficulty: 1 });
db.scenarios.createIndex({ emotionalLevers: 1 });

// attempts
db.attempts.createIndex({ userId: 1, createdAt: -1 });
db.attempts.createIndex({ campaignId: 1 });

// reviews
db.reviews.createIndex({ userId: 1, dueAt: 1 });

// campaigns
db.campaigns.createIndex({ orgId: 1, status: 1 });

// assignments
db.assignments.createIndex({ userId: 1, status: 1 });
db.assignments.createIndex({ campaignId: 1 });

// deliveries
db.deliveries.createIndex({ campaignId: 1 });
db.deliveries.createIndex({ userId: 1 });

// invitations
db.invitations.createIndex({ token: 1 }, { unique: true });
db.invitations.createIndex({ orgId: 1, status: 1 });

// consents
db.consents.createIndex({ userId: 1, policyType: 1 });

// notifications
db.notifications.createIndex({ userId: 1, read: 1, createdAt: -1 });

// auditLogs
db.auditLogs.createIndex({ orgId: 1, createdAt: -1 });

// surveys
db.surveys.createIndex({ orgId: 1, purpose: 1, isActive: 1 });

// surveyResponses — one response per user per survey
db.surveyResponses.createIndex({ userId: 1, surveyId: 1 }, { unique: true });
db.surveyResponses.createIndex({ orgId: 1, surveyId: 1 });

// sessions — token lookup, cascade-by-user, native TTL backstop alongside
// the app's own lazy-expire logic
db.sessions.createIndex({ token: 1 }, { unique: true });
db.sessions.createIndex({ userId: 1 });
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

print("[02-indexes] all indexes created.");

// unique index on each collection's PARTICULAR primary key (mirrors _id)
const PK = {
  organizations: "orgId", departments: "departmentId", users: "userId",
  profiles: "profileId", scenarios: "scenarioId", lessons: "lessonId",
  attempts: "attemptId", reviews: "reviewId", campaigns: "campaignId",
  assignments: "assignmentId", deliveries: "deliveryId", invitations: "invitationId",
  consents: "consentId", notifications: "notificationId", auditLogs: "auditLogId",
  surveys: "surveyId", surveyResponses: "surveyResponseId",
};
Object.entries(PK).forEach(function (e) {
  db[e[0]].createIndex({ [e[1]]: 1 }, { unique: true, name: e[1] + "_pk" });
});
print("[02-indexes] primary-key unique indexes created.");
