/**
 * 03-seed.js
 * Realistic starter dataset: 1 org, 7 users across 3 departments, scenarios,
 * lessons, a mandatory campaign + a surprise test with a real funnel, profiles,
 * attempts, consents, the onboarding survey + responses.
 *
 * Idempotent-ish: wipes the seeded collections first so re-running is clean.
 * (Safe here because this DB is for the MVP; do NOT point this at prod data.)
 */
db = db.getSiblingDB("phishaware");

const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 86400000);
// stamp every doc with the engineering-convention timestamps
const stamp = (doc, created) => Object.assign(
  { createdAt: created || now, updatedAt: now, deletedAt: null, metadata: {} }, doc
);

// particular primary key per collection; ins() sets _id + the named PK, then inserts
const PK = {
  organizations: "orgId", departments: "departmentId", users: "userId",
  profiles: "profileId", scenarios: "scenarioId", lessons: "lessonId",
  attempts: "attemptId", reviews: "reviewId", campaigns: "campaignId",
  assignments: "assignmentId", deliveries: "deliveryId", invitations: "invitationId",
  consents: "consentId", notifications: "notificationId", auditLogs: "auditLogId",
  surveys: "surveyId", surveyResponses: "surveyResponseId",
};
function ins(name, docs) {
  const pk = PK[name];
  const arr = Array.isArray(docs) ? docs : [docs];
  arr.forEach(function (d) { if (d._id === undefined) d._id = new ObjectId(); if (pk) d[pk] = d._id; });
  db[name].insertMany(arr);
}

// clean re-run
["organizations","departments","users","profiles","scenarios","lessons",
 "attempts","reviews","campaigns","assignments","deliveries","invitations",
 "consents","notifications","auditLogs","surveys","surveyResponses"
].forEach((c) => db[c].deleteMany({}));

// ---------- ids ----------
const orgId = new ObjectId();
const depSec = new ObjectId(), depFin = new ObjectId(), depSales = new ObjectId();
const uAdmin = new ObjectId(), uManager = new ObjectId();
const uEmp = [new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId()];
const surveyId = new ObjectId();

// ---------- organizations ----------
ins("organizations", stamp({
  _id: orgId, name: "Northwind Trading Co.", domain: "northwind.example",
  ssoProvider: "okta",
  settings: { passingScore: 80, dueWindowDays: 14, reminderCadenceDays: 3 },
}));

// ---------- departments ----------
ins("departments", [
  stamp({ _id: depSec,   orgId, name: "Security",   parentId: null, managerId: uManager }),
  stamp({ _id: depFin,   orgId, name: "Finance",    parentId: null, managerId: null }),
  stamp({ _id: depSales, orgId, name: "Sales",      parentId: null, managerId: null }),
]);

// ---------- users ----------
ins("users", [
  stamp({ _id: uAdmin, orgId, departmentId: depSec, email: "admin@northwind.example",
    passwordHash: null, ssoId: "okta|admin", name: "Ada Admin", role: "admin",
    jobRole: "Security Lead", managerId: null, status: "active", lastLoginAt: daysAgo(1) }),
  stamp({ _id: uManager, orgId, departmentId: depSec, email: "mona@northwind.example",
    passwordHash: null, ssoId: "okta|mona", name: "Mona Manager", role: "manager",
    jobRole: "Finance Manager", managerId: uAdmin, status: "active", lastLoginAt: daysAgo(2) }),
  stamp({ _id: uEmp[0], orgId, departmentId: depFin, email: "ap.clerk@northwind.example",
    passwordHash: null, ssoId: "okta|ap", name: "Pat Payable", role: "employee",
    jobRole: "AP Clerk", managerId: uManager, status: "active", lastLoginAt: daysAgo(3) }),
  stamp({ _id: uEmp[1], orgId, departmentId: depFin, email: "controller@northwind.example",
    passwordHash: null, ssoId: "okta|ctl", name: "Cory Controller", role: "employee",
    jobRole: "Controller", managerId: uManager, status: "active", lastLoginAt: daysAgo(5) }),
  stamp({ _id: uEmp[2], orgId, departmentId: depSales, email: "sdr@northwind.example",
    passwordHash: null, ssoId: "okta|sdr", name: "Sam Seller", role: "employee",
    jobRole: "Sales Rep", managerId: uManager, status: "active", lastLoginAt: daysAgo(1) }),
  stamp({ _id: uEmp[3], orgId, departmentId: depSales, email: "ae@northwind.example",
    passwordHash: null, ssoId: "okta|ae", name: "Alex Account", role: "employee",
    jobRole: "Account Exec", managerId: uManager, status: "active", lastLoginAt: daysAgo(7) }),
  stamp({ _id: uEmp[4], orgId, departmentId: depSec, email: "intern@northwind.example",
    passwordHash: null, ssoId: "okta|int", name: "Robin Rookie", role: "employee",
    jobRole: "Security Intern", managerId: uManager, status: "invited", lastLoginAt: null }),
]);

// ---------- profiles (1:1 with users) ----------
const allUsers = [uAdmin, uManager, ...uEmp];
const profileFor = (userId, risk, weak) => stamp({
  userId, orgId, riskScore: risk, riskModelVersion: "v0.3-spamley",
  riskComputedAt: now,
  emotionalVulnerability: { urgency: 0.6, authority: 0.5, fear: 0.4, reward: 0.3, curiosity: 0.5, trust: 0.45 },
  cueAccuracy: { sender_domain: 0.7, mismatched_link: 0.55, urgency_language: 0.6 },
  vectorAccuracy: { email: 0.72, sms: 0.4 },
  calibrationScore: 0.6, xp: 320, level: 4, streak: 3,
  badges: ["first_catch", "week_streak"], weakLevers: weak,
});
ins("profiles", [
  profileFor(uAdmin,    12, ["reward"]),
  profileFor(uManager,  28, ["authority"]),
  profileFor(uEmp[0],   64, ["urgency", "authority"]),
  profileFor(uEmp[1],   41, ["fear"]),
  profileFor(uEmp[2],   55, ["curiosity", "reward"]),
  profileFor(uEmp[3],   37, ["trust"]),
  profileFor(uEmp[4],   70, ["urgency"]),  // brand-new: baseline came from survey
]);

// ---------- scenarios (8, all six levers represented) ----------
const scn = [];
const mkScenario = (isPhish, difficulty, subject, levers, cues) => {
  const _id = new ObjectId(); scn.push(_id);
  return stamp({
    _id, orgId: null, vector: "email", isPhish, difficulty,
    sender: isPhish ? "it-support@northwlnd.example" : "it-support@northwind.example",
    subject, body: "[rendered non-clickable body]",
    links: isPhish ? [{ text: "Verify now", isSuspicious: true }] : [{ text: "Portal", isSuspicious: false }],
    attachments: [], cues, emotionalLevers: levers,
    targetRoles: ["AP Clerk", "Controller"], source: "library", isActive: true,
  });
};
ins("scenarios", [
  mkScenario(true, 3, "URGENT: wire transfer approval needed", ["urgency","authority"],
    [{ type: "urgency_language", severity: 3, explanation: "Pressure to act fast" },
     { type: "sender_domain", severity: 4, explanation: "northwlnd != northwind" }]),
  mkScenario(true, 2, "You've won a $500 gift card", ["reward","curiosity"],
    [{ type: "credential_request", severity: 3, explanation: "Asks for login to claim" }]),
  mkScenario(true, 4, "Your account will be suspended", ["fear","urgency"],
    [{ type: "mismatched_link", severity: 4, explanation: "Link text hides real URL" }]),
  mkScenario(true, 3, "CEO: quick task, are you at your desk?", ["authority","trust"],
    [{ type: "generic_greeting", severity: 2, explanation: "No name, impersonation" }]),
  mkScenario(true, 2, "Invoice overdue - see attached", ["urgency"],
    [{ type: "unexpected_attachment", severity: 3, explanation: "Unexpected .zip" }]),
  mkScenario(true, 3, "Scan to update your MFA", ["curiosity","authority"],
    [{ type: "suspicious_qr", severity: 4, explanation: "QR to unknown host" }]),
  mkScenario(false, 1, "Team lunch Friday", [],
    [{ type: "sender_domain", severity: 0, explanation: "Legit internal sender" }]),
  mkScenario(false, 2, "Your monthly expense report is ready", [],
    []),
]);

// ---------- lessons (one per vector) ----------
const vectors = ["email","sms","voice","qr","social","web"];
ins("lessons", vectors.map((v, i) => stamp({
  vector: v, title: `Spotting ${v} phishing`,
  steps: [{ heading: "What to look for", body: "Key red flags...", mediaUrl: null, mediaType: null }],
  redFlags: ["mismatched sender", "urgency", "credential request"],
  difficulty: 2, order: i + 1, isActive: true,
})));

// ---------- campaigns ----------
const campMandatory = new ObjectId(), campSurprise = new ObjectId();
ins("campaigns", [
  stamp({ _id: campMandatory, orgId, type: "mandatory", name: "Q3 Security Training",
    scenarioIds: [scn[0], scn[6]], lessonIds: [], audience: { roles: ["employee"] },
    dueDate: daysAgo(-14), scheduledAt: daysAgo(2), status: "active", createdBy: uAdmin }),
  stamp({ _id: campSurprise, orgId, type: "surprise_test", name: "Wire Fraud Drill",
    scenarioIds: [scn[0]], lessonIds: [], audience: { departments: [depFin.str] },
    dueDate: null, scheduledAt: daysAgo(4), status: "completed", createdBy: uAdmin }),
]);

// ---------- assignments (mandatory campaign) ----------
ins("assignments", [
  stamp({ campaignId: campMandatory, userId: uEmp[0], orgId, status: "completed", progress: 100, completedAt: daysAgo(1) }),
  stamp({ campaignId: campMandatory, userId: uEmp[1], orgId, status: "in_progress", progress: 60, completedAt: null }),
  stamp({ campaignId: campMandatory, userId: uEmp[2], orgId, status: "assigned", progress: 0, completedAt: null }),
  stamp({ campaignId: campMandatory, userId: uEmp[3], orgId, status: "overdue", progress: 20, completedAt: null }),
]);

// ---------- deliveries (surprise test funnel: send->open->click->report) ----------
ins("deliveries", [
  // reported = win
  stamp({ campaignId: campSurprise, userId: uEmp[1], orgId, scenarioId: scn[0],
    sentAt: daysAgo(4), openedAt: daysAgo(4), clickedAt: null, reportedAt: daysAgo(4), outcome: "reported" }),
  // clicked = fail
  stamp({ campaignId: campSurprise, userId: uEmp[0], orgId, scenarioId: scn[0],
    sentAt: daysAgo(4), openedAt: daysAgo(4), clickedAt: daysAgo(4), reportedAt: null, outcome: "clicked" }),
  // opened, didn't act
  stamp({ campaignId: campSurprise, userId: uEmp[2], orgId, scenarioId: scn[0],
    sentAt: daysAgo(4), openedAt: daysAgo(3), clickedAt: null, reportedAt: null, outcome: "opened" }),
  // never opened
  stamp({ campaignId: campSurprise, userId: uEmp[3], orgId, scenarioId: scn[0],
    sentAt: daysAgo(4), openedAt: null, clickedAt: null, reportedAt: null, outcome: "ignored" }),
]);

// ---------- attempts (practice) ----------
ins("attempts", [
  stamp({ userId: uEmp[0], orgId, scenarioId: scn[0], campaignId: campMandatory,
    verdict: "phish", selectedCues: ["urgency_language"], confidence: 70, correct: true,
    caughtCues: ["urgency_language"], missedCues: ["sender_domain"],
    leversPresent: ["urgency","authority"], timeToDecideMs: 8200, xpAwarded: 50 }),
  stamp({ userId: uEmp[0], orgId, scenarioId: scn[6], campaignId: campMandatory,
    verdict: "phish", selectedCues: [], confidence: 40, correct: false,
    caughtCues: [], missedCues: [], leversPresent: [], timeToDecideMs: 5100, xpAwarded: 0 }),
  stamp({ userId: uEmp[2], orgId, scenarioId: scn[1], campaignId: null,
    verdict: "legit", selectedCues: [], confidence: 55, correct: false,
    caughtCues: [], missedCues: ["credential_request"], leversPresent: ["reward","curiosity"],
    timeToDecideMs: 6300, xpAwarded: 0 }),
]);

// ---------- reviews (spaced repetition, seeded from weakLevers) ----------
ins("reviews", [
  stamp({ userId: uEmp[0], orgId, targetType: "emotionalLever", targetValue: "urgency",
    dueAt: daysAgo(-1), interval: 1, easeFactor: 2.5, lastReviewedAt: daysAgo(2) }),
  stamp({ userId: uEmp[2], orgId, targetType: "cueType", targetValue: "credential_request",
    dueAt: now, interval: 1, easeFactor: 2.5, lastReviewedAt: null }),
]);

// ---------- consents (required before profiling) ----------
ins("consents", allUsers.map((userId) => stamp({
  userId, orgId, policyType: "emotional_profiling", policyVersion: "2026-01",
  granted: true, grantedAt: daysAgo(6), revokedAt: null,
})));

// ---------- notifications ----------
ins("notifications", [
  stamp({ userId: uEmp[4], orgId, type: "survey", title: "Take your 2-min baseline survey",
    body: "Help us tailor your training.", channel: "in_app", read: false, sentAt: now }),
  stamp({ userId: uEmp[3], orgId, type: "reminder", title: "Training overdue",
    body: "Q3 Security Training is past due.", channel: "email", read: false, sentAt: daysAgo(1) }),
]);

// ---------- auditLogs ----------
ins("auditLogs", [
  stamp({ orgId, actorId: uAdmin, action: "campaign.launched", targetType: "campaign",
    targetId: campSurprise, metadata: { type: "surprise_test" }, ip: "203.0.113.10" }),
  stamp({ orgId, actorId: uAdmin, action: "employee.invited", targetType: "user",
    targetId: uEmp[4], metadata: {}, ip: "203.0.113.10" }),
]);

// ================= NEW — onboarding survey =================
ins("surveys", stamp({
  _id: surveyId, orgId: null, title: "Security Awareness Baseline",
  description: "6 quick questions so we can tailor your training. ~2 minutes.",
  purpose: "onboarding_baseline", estimatedMinutes: 2, isActive: true,
  questions: [
    { key: "conf_detect", prompt: "How confident are you at spotting phishing emails?",
      type: "likert_1_5", options: [],
      mapsTo: { dimension: "confidence", weight: 1.0 } },
    { key: "prior_victim", prompt: "Have you ever clicked a phishing link or been scammed?",
      type: "boolean", options: [],
      mapsTo: { dimension: "exposure", weight: 1.0 } },
    { key: "handles_money", prompt: "Do you handle payments, invoices, or wire transfers?",
      type: "boolean", options: [],
      mapsTo: { dimension: "role_risk", weight: 1.2 } },
    { key: "pressure_response", prompt: "An email from a senior exec marked URGENT would make you:",
      type: "single_choice",
      options: [{ label: "Act immediately", value: "act" },
                { label: "Verify first", value: "verify" },
                { label: "Ignore", value: "ignore" }],
      mapsTo: { dimension: "emotionalVulnerability", lever: "authority", weight: 1.0 } },
    { key: "tempting_levers", prompt: "Which of these would most likely get you to click?",
      type: "multi_choice",
      options: [{ label: "A reward/prize", value: "reward" },
                { label: "A deadline", value: "urgency" },
                { label: "Curiosity", value: "curiosity" },
                { label: "A threat/warning", value: "fear" }],
      mapsTo: { dimension: "emotionalVulnerability", weight: 1.0 } },
    { key: "training_freq", prompt: "When did you last do security training?",
      type: "single_choice",
      options: [{ label: "<6 months", value: "recent" },
                { label: "6-12 months", value: "mid" },
                { label: ">1 year / never", value: "stale" }],
      mapsTo: { dimension: "exposure", weight: 0.8 } },
  ],
}));

// ---------- surveyResponses (baseline signal for the new intern + one employee) ----------
ins("surveyResponses", [
  stamp({ surveyId, userId: uEmp[4], orgId,
    answers: [
      { questionKey: "conf_detect", value: 2 },
      { questionKey: "prior_victim", value: true },
      { questionKey: "handles_money", value: false },
      { questionKey: "pressure_response", value: "act" },
      { questionKey: "tempting_levers", value: ["urgency", "reward"] },
      { questionKey: "training_freq", value: "stale" },
    ],
    derivedSignals: { selfConfidence: 0.3, exposureLevel: "high",
      leverGuess: { authority: 0.8, urgency: 0.7, reward: 0.6 } },
    baselineRiskContribution: 70, completedAt: daysAgo(1) }),
  stamp({ surveyId, userId: uEmp[2], orgId,
    answers: [
      { questionKey: "conf_detect", value: 3 },
      { questionKey: "prior_victim", value: false },
      { questionKey: "handles_money", value: false },
      { questionKey: "pressure_response", value: "verify" },
      { questionKey: "tempting_levers", value: ["curiosity", "reward"] },
      { questionKey: "training_freq", value: "mid" },
    ],
    derivedSignals: { selfConfidence: 0.55, exposureLevel: "medium",
      leverGuess: { curiosity: 0.6, reward: 0.6 } },
    baselineRiskContribution: 50, completedAt: daysAgo(3) }),
]);

// ---------- summary ----------
print("\n[03-seed] done. Document counts:");
["organizations","departments","users","profiles","scenarios","lessons",
 "attempts","reviews","campaigns","assignments","deliveries","consents",
 "notifications","auditLogs","surveys","surveyResponses"
].forEach((c) => print("  " + c + ": " + db[c].countDocuments()));