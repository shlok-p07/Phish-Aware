/**
 * 03-seed.js -- GENERATED from src/db/demoDataset.ts. Do not edit by hand.
 *
 * A demo organisation (Northwind Trading Co.) for local development and
 * screenshots. Run it after 01-validators.js and 02-indexes.js:
 *
 *   mongosh "<uri>" database/init/03-seed.js                        # add or refresh
 *   DEMO_SEED_REMOVE=1 mongosh "<uri>" database/init/03-seed.js     # remove it again
 *
 * Safe by construction:
 * - Every document has a fixed demo _id and is upserted, so re-running refreshes
 *   the demo and nothing else. It never deletes or rewrites other documents.
 * - It refuses to run against a database that has real users (anyone other
 *   than these members and the app's isDemo leaderboard fixtures), because a
 *   demo org has no place in production. DEMO_SEED_FORCE=1 overrides that.
 * - No member has a password, and the pending invitation's token is generated
 *   fresh on each run, so nothing committed here can be used to sign in.
 *
 * To change the data, edit src/db/demoDataset.ts and run
 * `bun run db:export-schema`. src/db/demoDataset.test.ts fails if this file
 * is out of date.
 */
db = db.getSiblingDB("phishaware");

const DATA = {
  "organizations": [
    {
      "_id": {
        "$oid": "de0000000000000000000001"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Northwind Trading Co.",
      "domain": "northwind.example",
      "ssoProvider": null,
      "settings": {
        "seatLimit": 25
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 60
      },
      "updatedAt": {
        "$daysAgo": 60
      },
      "deletedAt": null
    }
  ],
  "departments": [
    {
      "_id": {
        "$oid": "de0000000000000000000002"
      },
      "departmentId": {
        "$oid": "de0000000000000000000002"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "IT",
      "parentId": null,
      "managerId": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 60
      },
      "updatedAt": {
        "$daysAgo": 60
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000003"
      },
      "departmentId": {
        "$oid": "de0000000000000000000003"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Finance",
      "parentId": null,
      "managerId": {
        "$oid": "de0000000000000000000006"
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 60
      },
      "updatedAt": {
        "$daysAgo": 60
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000004"
      },
      "departmentId": {
        "$oid": "de0000000000000000000004"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Sales",
      "parentId": null,
      "managerId": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 60
      },
      "updatedAt": {
        "$daysAgo": 60
      },
      "deletedAt": null
    }
  ],
  "users": [
    {
      "_id": {
        "$oid": "de0000000000000000000005"
      },
      "userId": {
        "$oid": "de0000000000000000000005"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Ada Admin",
      "email": "ada@northwind.example",
      "passwordHash": null,
      "isGuest": false,
      "level": "beginner",
      "xp": 0,
      "streak": 0,
      "lastActiveDate": null,
      "badges": [],
      "calibrationScore": 0,
      "department": "IT",
      "workType": "Hybrid",
      "surveyFeatures": {
        "emails_per_day": 55,
        "suspicious_emails_per_day": 2,
        "password_length": 16,
        "reuses_passwords": 0,
        "uses_password_manager": 1,
        "mfa_familiar": 1,
        "mfa_enabled": 1,
        "security_training": 1,
        "clicks_links": 7,
        "opens_attachments": 6,
        "verifies_links": 79,
        "reports_suspicious": 70,
        "has_antivirus": 1,
        "uses_vpn": 0,
        "department": "IT",
        "work_mode": "Hybrid"
      },
      "phishingAwarenessScore": 0.88,
      "phishingAwarenessModelVersion": "awareness-v2.0.0",
      "phishingAwarenessComputedAt": {
        "$daysAgo": 44
      },
      "onboardingCompleted": true,
      "role": "admin",
      "status": "active",
      "lastLoginAt": {
        "$daysAgo": 1
      },
      "passwordResetCodeHash": null,
      "passwordResetExpiresAt": null,
      "failedLoginAttempts": 0,
      "lockedUntil": null,
      "mustResetPassword": false,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 45
      },
      "updatedAt": {
        "$daysAgo": 45
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000006"
      },
      "userId": {
        "$oid": "de0000000000000000000006"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Mona Manager",
      "email": "mona@northwind.example",
      "passwordHash": null,
      "isGuest": false,
      "level": "beginner",
      "xp": 25,
      "streak": 0,
      "lastActiveDate": null,
      "badges": [
        "first_catch"
      ],
      "calibrationScore": 0,
      "department": "Finance",
      "workType": "Office",
      "surveyFeatures": {
        "emails_per_day": 55,
        "suspicious_emails_per_day": 2,
        "password_length": 16,
        "reuses_passwords": 0,
        "uses_password_manager": 1,
        "mfa_familiar": 1,
        "mfa_enabled": 1,
        "security_training": 1,
        "clicks_links": 17,
        "opens_attachments": 14,
        "verifies_links": 65,
        "reports_suspicious": 58,
        "has_antivirus": 1,
        "uses_vpn": 0,
        "department": "Finance",
        "work_mode": "Office"
      },
      "phishingAwarenessScore": 0.72,
      "phishingAwarenessModelVersion": "awareness-v2.0.0",
      "phishingAwarenessComputedAt": {
        "$daysAgo": 44
      },
      "onboardingCompleted": true,
      "role": "manager",
      "status": "active",
      "lastLoginAt": {
        "$daysAgo": 2
      },
      "passwordResetCodeHash": null,
      "passwordResetExpiresAt": null,
      "failedLoginAttempts": 0,
      "lockedUntil": null,
      "mustResetPassword": false,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 45
      },
      "updatedAt": {
        "$daysAgo": 45
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000007"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Pat Payable",
      "email": "pat@northwind.example",
      "passwordHash": null,
      "isGuest": false,
      "level": "beginner",
      "xp": 25,
      "streak": 0,
      "lastActiveDate": null,
      "badges": [
        "first_catch"
      ],
      "calibrationScore": 0,
      "department": "Finance",
      "workType": "Office",
      "surveyFeatures": {
        "emails_per_day": 55,
        "suspicious_emails_per_day": 2,
        "password_length": 10,
        "reuses_passwords": 1,
        "uses_password_manager": 0,
        "mfa_familiar": 1,
        "mfa_enabled": 0,
        "security_training": 1,
        "clicks_links": 38,
        "opens_attachments": 32,
        "verifies_links": 32,
        "reports_suspicious": 29,
        "has_antivirus": 1,
        "uses_vpn": 0,
        "department": "Finance",
        "work_mode": "Office"
      },
      "phishingAwarenessScore": 0.36,
      "phishingAwarenessModelVersion": "awareness-v2.0.0",
      "phishingAwarenessComputedAt": {
        "$daysAgo": 44
      },
      "onboardingCompleted": true,
      "role": "employee",
      "status": "active",
      "lastLoginAt": {
        "$daysAgo": 3
      },
      "passwordResetCodeHash": null,
      "passwordResetExpiresAt": null,
      "failedLoginAttempts": 0,
      "lockedUntil": null,
      "mustResetPassword": false,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 45
      },
      "updatedAt": {
        "$daysAgo": 45
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000008"
      },
      "userId": {
        "$oid": "de0000000000000000000008"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Cory Controller",
      "email": "cory@northwind.example",
      "passwordHash": null,
      "isGuest": false,
      "level": "beginner",
      "xp": 25,
      "streak": 0,
      "lastActiveDate": null,
      "badges": [
        "first_catch"
      ],
      "calibrationScore": 0,
      "department": "Finance",
      "workType": "Hybrid",
      "surveyFeatures": {
        "emails_per_day": 55,
        "suspicious_emails_per_day": 2,
        "password_length": 10,
        "reuses_passwords": 1,
        "uses_password_manager": 0,
        "mfa_familiar": 1,
        "mfa_enabled": 0,
        "security_training": 1,
        "clicks_links": 25,
        "opens_attachments": 21,
        "verifies_links": 53,
        "reports_suspicious": 47,
        "has_antivirus": 1,
        "uses_vpn": 0,
        "department": "Finance",
        "work_mode": "Hybrid"
      },
      "phishingAwarenessScore": 0.59,
      "phishingAwarenessModelVersion": "awareness-v2.0.0",
      "phishingAwarenessComputedAt": {
        "$daysAgo": 44
      },
      "onboardingCompleted": true,
      "role": "employee",
      "status": "active",
      "lastLoginAt": {
        "$daysAgo": 5
      },
      "passwordResetCodeHash": null,
      "passwordResetExpiresAt": null,
      "failedLoginAttempts": 0,
      "lockedUntil": null,
      "mustResetPassword": false,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 45
      },
      "updatedAt": {
        "$daysAgo": 45
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000009"
      },
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Sam Seller",
      "email": "sam@northwind.example",
      "passwordHash": null,
      "isGuest": false,
      "level": "beginner",
      "xp": 5,
      "streak": 0,
      "lastActiveDate": null,
      "badges": [],
      "calibrationScore": 0,
      "department": "Sales",
      "workType": "Remote",
      "surveyFeatures": {
        "emails_per_day": 90,
        "suspicious_emails_per_day": 2,
        "password_length": 10,
        "reuses_passwords": 1,
        "uses_password_manager": 0,
        "mfa_familiar": 1,
        "mfa_enabled": 0,
        "security_training": 1,
        "clicks_links": 33,
        "opens_attachments": 28,
        "verifies_links": 41,
        "reports_suspicious": 36,
        "has_antivirus": 1,
        "uses_vpn": 1,
        "department": "Sales",
        "work_mode": "Remote"
      },
      "phishingAwarenessScore": 0.45,
      "phishingAwarenessModelVersion": "awareness-v2.0.0",
      "phishingAwarenessComputedAt": {
        "$daysAgo": 44
      },
      "onboardingCompleted": true,
      "role": "employee",
      "status": "active",
      "lastLoginAt": {
        "$daysAgo": 1
      },
      "passwordResetCodeHash": null,
      "passwordResetExpiresAt": null,
      "failedLoginAttempts": 0,
      "lockedUntil": null,
      "mustResetPassword": false,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 45
      },
      "updatedAt": {
        "$daysAgo": 45
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000000a"
      },
      "userId": {
        "$oid": "de000000000000000000000a"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "name": "Alex Account",
      "email": "alex@northwind.example",
      "passwordHash": null,
      "isGuest": false,
      "level": "beginner",
      "xp": 20,
      "streak": 0,
      "lastActiveDate": null,
      "badges": [
        "first_catch"
      ],
      "calibrationScore": 0,
      "department": "Sales",
      "workType": "Remote",
      "surveyFeatures": {
        "emails_per_day": 90,
        "suspicious_emails_per_day": 2,
        "password_length": 16,
        "reuses_passwords": 0,
        "uses_password_manager": 1,
        "mfa_familiar": 1,
        "mfa_enabled": 1,
        "security_training": 1,
        "clicks_links": 22,
        "opens_attachments": 19,
        "verifies_links": 57,
        "reports_suspicious": 50,
        "has_antivirus": 1,
        "uses_vpn": 1,
        "department": "Sales",
        "work_mode": "Remote"
      },
      "phishingAwarenessScore": 0.63,
      "phishingAwarenessModelVersion": "awareness-v2.0.0",
      "phishingAwarenessComputedAt": {
        "$daysAgo": 44
      },
      "onboardingCompleted": true,
      "role": "employee",
      "status": "active",
      "lastLoginAt": {
        "$daysAgo": 7
      },
      "passwordResetCodeHash": null,
      "passwordResetExpiresAt": null,
      "failedLoginAttempts": 0,
      "lockedUntil": null,
      "mustResetPassword": false,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 45
      },
      "updatedAt": {
        "$daysAgo": 45
      },
      "deletedAt": null
    }
  ],
  "invitations": [
    {
      "_id": {
        "$oid": "de0000000000000000000031"
      },
      "invitationId": {
        "$oid": "de0000000000000000000031"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "email": "robin@northwind.example",
      "name": "Robin Rookie",
      "role": "employee",
      "departmentId": {
        "$oid": "de0000000000000000000002"
      },
      "department": "IT",
      "token": {
        "$randomToken": true
      },
      "status": "pending",
      "invitedBy": {
        "$oid": "de0000000000000000000005"
      },
      "expiresAt": {
        "$daysAgo": -12
      },
      "acceptedAt": null,
      "acceptedUserId": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 2
      },
      "updatedAt": {
        "$daysAgo": 2
      },
      "deletedAt": null
    }
  ],
  "scenarios": [
    {
      "_id": {
        "$oid": "de000000000000000000000b"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000b"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "vector": "email",
      "isPhish": true,
      "difficulty": 3,
      "sender": "Accounts Payable <ap@northwlnd.example>",
      "subject": "URGENT: wire transfer approval needed today",
      "body": "Hi {{firstName}}, the CFO needs this wire approved before 3pm. Use the portal below.",
      "links": [
        {
          "text": "Approve transfer",
          "isSuspicious": true
        }
      ],
      "attachments": [],
      "cues": [
        {
          "type": "urgency_language",
          "severity": 4,
          "explanation": "A same-day deadline pressures you to skip verification."
        },
        {
          "type": "sender_domain",
          "severity": 5,
          "explanation": "northwlnd.example swaps an i for an l in northwind."
        }
      ],
      "isOnboarding": false,
      "emotionalLevers": [
        "urgency",
        "authority"
      ],
      "attackType": "bec",
      "source": "library",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 40
      },
      "updatedAt": {
        "$daysAgo": 40
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000000c"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000c"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "vector": "email",
      "isPhish": true,
      "difficulty": 2,
      "sender": "Rewards Team <rewards@nw-perks.example>",
      "subject": "You've earned a $500 gift card",
      "body": "Congratulations! Sign in with your work account to claim your reward.",
      "links": [
        {
          "text": "Claim reward",
          "isSuspicious": true
        }
      ],
      "attachments": [],
      "cues": [
        {
          "type": "credential_request",
          "severity": 5,
          "explanation": "A gift card never needs your work password."
        },
        {
          "type": "sender_domain",
          "severity": 3,
          "explanation": "nw-perks.example is not a Northwind domain."
        }
      ],
      "isOnboarding": false,
      "emotionalLevers": [
        "reward",
        "curiosity"
      ],
      "attackType": "credential_harvesting",
      "source": "library",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 40
      },
      "updatedAt": {
        "$daysAgo": 40
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000000d"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000d"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "vector": "email",
      "isPhish": true,
      "difficulty": 4,
      "sender": "IT Service Desk <it-desk@northwind-support.example>",
      "subject": "Your mailbox will be suspended",
      "body": "Dear user, your mailbox exceeded its quota. Re-validate within 24 hours to avoid suspension.",
      "links": [
        {
          "text": "Re-validate mailbox",
          "isSuspicious": true
        }
      ],
      "attachments": [],
      "cues": [
        {
          "type": "generic_greeting",
          "severity": 3,
          "explanation": "Real IT messages address you by name."
        },
        {
          "type": "mismatched_link",
          "severity": 4,
          "explanation": "The link text says northwind.example but points elsewhere."
        }
      ],
      "isOnboarding": false,
      "emotionalLevers": [
        "fear",
        "urgency"
      ],
      "attackType": "it_helpdesk_scam",
      "source": "library",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 40
      },
      "updatedAt": {
        "$daysAgo": 40
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000000e"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000e"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "vector": "email",
      "isPhish": false,
      "difficulty": 1,
      "sender": "Mona Manager <mona@northwind.example>",
      "subject": "Team lunch on Friday",
      "body": "Hi team, lunch is at noon on Friday in the 4th-floor kitchen. Reply if you have dietary needs.",
      "links": [],
      "attachments": [],
      "cues": [],
      "isOnboarding": false,
      "source": "library",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 40
      },
      "updatedAt": {
        "$daysAgo": 40
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000000f"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000f"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "vector": "email",
      "isPhish": false,
      "difficulty": 2,
      "sender": "Expenses <expenses@northwind.example>",
      "subject": "Your monthly expense report is ready",
      "body": "Your October report is ready to review in the usual expenses portal.",
      "links": [],
      "attachments": [],
      "cues": [],
      "isOnboarding": false,
      "source": "library",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 40
      },
      "updatedAt": {
        "$daysAgo": 40
      },
      "deletedAt": null
    }
  ],
  "campaigns": [
    {
      "_id": {
        "$oid": "de0000000000000000000010"
      },
      "campaignId": {
        "$oid": "de0000000000000000000010"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "type": "mandatory",
      "name": "Q4 Security Training",
      "scenarioIds": [
        {
          "$oid": "de000000000000000000000b"
        },
        {
          "$oid": "de000000000000000000000e"
        }
      ],
      "lessonIds": [],
      "audience": {},
      "dueDate": {
        "$daysAgo": -14
      },
      "status": "active",
      "createdBy": {
        "$oid": "de0000000000000000000005"
      },
      "target": "all",
      "requiredScenarios": 5,
      "focus": {
        "vectors": [
          "email"
        ],
        "minDifficulty": 2,
        "cues": [
          "sender_domain"
        ]
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 10
      },
      "updatedAt": {
        "$daysAgo": 10
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000011"
      },
      "campaignId": {
        "$oid": "de0000000000000000000011"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "type": "surprise_test",
      "name": "Wire Fraud Drill",
      "scenarioIds": [
        {
          "$oid": "de000000000000000000000b"
        }
      ],
      "lessonIds": [],
      "audience": {},
      "dueDate": null,
      "status": "completed",
      "createdBy": {
        "$oid": "de0000000000000000000005"
      },
      "target": "department:Finance",
      "requiredScenarios": 1,
      "focus": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 6
      },
      "updatedAt": {
        "$daysAgo": 6
      },
      "deletedAt": null
    }
  ],
  "assignments": [
    {
      "_id": {
        "$oid": "de0000000000000000000012"
      },
      "assignmentId": {
        "$oid": "de0000000000000000000012"
      },
      "campaignId": {
        "$oid": "de0000000000000000000010"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "status": "completed",
      "progress": 100,
      "completedAt": {
        "$daysAgo": 1
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 10
      },
      "updatedAt": {
        "$daysAgo": 10
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000013"
      },
      "assignmentId": {
        "$oid": "de0000000000000000000013"
      },
      "campaignId": {
        "$oid": "de0000000000000000000010"
      },
      "userId": {
        "$oid": "de0000000000000000000008"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "status": "in_progress",
      "progress": 60,
      "completedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 10
      },
      "updatedAt": {
        "$daysAgo": 10
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000014"
      },
      "assignmentId": {
        "$oid": "de0000000000000000000014"
      },
      "campaignId": {
        "$oid": "de0000000000000000000010"
      },
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "status": "assigned",
      "progress": 0,
      "completedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 10
      },
      "updatedAt": {
        "$daysAgo": 10
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000015"
      },
      "assignmentId": {
        "$oid": "de0000000000000000000015"
      },
      "campaignId": {
        "$oid": "de0000000000000000000010"
      },
      "userId": {
        "$oid": "de000000000000000000000a"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "status": "overdue",
      "progress": 20,
      "completedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 10
      },
      "updatedAt": {
        "$daysAgo": 10
      },
      "deletedAt": null
    }
  ],
  "deliveries": [
    {
      "_id": {
        "$oid": "de0000000000000000000016"
      },
      "deliveryId": {
        "$oid": "de0000000000000000000016"
      },
      "campaignId": {
        "$oid": "de0000000000000000000011"
      },
      "userId": {
        "$oid": "de0000000000000000000008"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000b"
      },
      "sentAt": {
        "$daysAgo": 4
      },
      "openedAt": {
        "$daysAgo": 4
      },
      "clickedAt": null,
      "reportedAt": {
        "$daysAgo": 4
      },
      "outcome": "reported",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 4
      },
      "updatedAt": {
        "$daysAgo": 4
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000017"
      },
      "deliveryId": {
        "$oid": "de0000000000000000000017"
      },
      "campaignId": {
        "$oid": "de0000000000000000000011"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000b"
      },
      "sentAt": {
        "$daysAgo": 4
      },
      "openedAt": {
        "$daysAgo": 4
      },
      "clickedAt": {
        "$daysAgo": 4
      },
      "reportedAt": null,
      "outcome": "clicked",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 4
      },
      "updatedAt": {
        "$daysAgo": 4
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000018"
      },
      "deliveryId": {
        "$oid": "de0000000000000000000018"
      },
      "campaignId": {
        "$oid": "de0000000000000000000011"
      },
      "userId": {
        "$oid": "de0000000000000000000006"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000b"
      },
      "sentAt": {
        "$daysAgo": 4
      },
      "openedAt": {
        "$daysAgo": 3
      },
      "clickedAt": null,
      "reportedAt": null,
      "outcome": "opened",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 4
      },
      "updatedAt": {
        "$daysAgo": 4
      },
      "deletedAt": null
    }
  ],
  "attempts": [
    {
      "_id": {
        "$oid": "de0000000000000000000019"
      },
      "attemptId": {
        "$oid": "de0000000000000000000019"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000b"
      },
      "campaignId": {
        "$oid": "de0000000000000000000010"
      },
      "verdict": "phish",
      "selectedCues": [
        "urgency_language"
      ],
      "confidence": 70,
      "correct": true,
      "missedCues": [
        "sender_domain"
      ],
      "falseCues": [],
      "caughtCues": [
        "urgency_language"
      ],
      "explanation": "Nice catch -- this one was phishing. You correctly flagged: Urgency or pressure to act fast. Worth noting for next time: Mismatched sender domain.",
      "calibrationNote": "Great calibration -- you were confident and right.",
      "xpAwarded": 20,
      "leversPresent": [
        "urgency",
        "authority"
      ],
      "attackType": "bec",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 3
      },
      "updatedAt": {
        "$daysAgo": 3
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000001a"
      },
      "attemptId": {
        "$oid": "de000000000000000000001a"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000e"
      },
      "campaignId": {
        "$oid": "de0000000000000000000010"
      },
      "verdict": "phish",
      "selectedCues": [],
      "confidence": 40,
      "correct": false,
      "missedCues": [],
      "falseCues": [],
      "caughtCues": [],
      "explanation": "This message was actually legitimate; it just had some suspicious-looking traits.",
      "calibrationNote": "Keep practicing to build sharper instincts on messages like this one.",
      "xpAwarded": 5,
      "leversPresent": [],
      "metadata": {},
      "createdAt": {
        "$daysAgo": 3
      },
      "updatedAt": {
        "$daysAgo": 3
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000001b"
      },
      "attemptId": {
        "$oid": "de000000000000000000001b"
      },
      "userId": {
        "$oid": "de0000000000000000000008"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000b"
      },
      "campaignId": {
        "$oid": "de0000000000000000000010"
      },
      "verdict": "phish",
      "selectedCues": [
        "urgency_language",
        "sender_domain"
      ],
      "confidence": 85,
      "correct": true,
      "missedCues": [],
      "falseCues": [],
      "caughtCues": [
        "sender_domain",
        "urgency_language"
      ],
      "explanation": "Nice catch -- this one was phishing. You correctly flagged: Mismatched sender domain, Urgency or pressure to act fast. You caught every red flag in this one.",
      "calibrationNote": "Great calibration -- you were confident and right.",
      "xpAwarded": 25,
      "leversPresent": [
        "urgency",
        "authority"
      ],
      "attackType": "bec",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 2
      },
      "updatedAt": {
        "$daysAgo": 2
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000001c"
      },
      "attemptId": {
        "$oid": "de000000000000000000001c"
      },
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000c"
      },
      "campaignId": null,
      "verdict": "legit",
      "selectedCues": [],
      "confidence": 55,
      "correct": false,
      "missedCues": [
        "credential_request",
        "sender_domain"
      ],
      "falseCues": [],
      "caughtCues": [],
      "explanation": "This one was actually phishing, even though it looked convincing. You didn't flag any of the specific red flags this time. Worth noting for next time: Asks for a password or payment info, Mismatched sender domain.",
      "calibrationNote": "Keep practicing to build sharper instincts on messages like this one.",
      "xpAwarded": 5,
      "leversPresent": [
        "reward",
        "curiosity"
      ],
      "attackType": "credential_harvesting",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 2
      },
      "updatedAt": {
        "$daysAgo": 2
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000001d"
      },
      "attemptId": {
        "$oid": "de000000000000000000001d"
      },
      "userId": {
        "$oid": "de000000000000000000000a"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000d"
      },
      "campaignId": null,
      "verdict": "phish",
      "selectedCues": [
        "mismatched_link"
      ],
      "confidence": 60,
      "correct": true,
      "missedCues": [
        "generic_greeting"
      ],
      "falseCues": [],
      "caughtCues": [
        "mismatched_link"
      ],
      "explanation": "Nice catch -- this one was phishing. You correctly flagged: Suspicious or mismatched link. Worth noting for next time: Generic greeting (no personal name).",
      "calibrationNote": "Keep practicing to build sharper instincts on messages like this one.",
      "xpAwarded": 20,
      "leversPresent": [
        "fear",
        "urgency"
      ],
      "attackType": "it_helpdesk_scam",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 6
      },
      "updatedAt": {
        "$daysAgo": 6
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000001e"
      },
      "attemptId": {
        "$oid": "de000000000000000000001e"
      },
      "userId": {
        "$oid": "de0000000000000000000006"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "scenarioId": {
        "$oid": "de000000000000000000000c"
      },
      "campaignId": null,
      "verdict": "phish",
      "selectedCues": [
        "credential_request",
        "sender_domain"
      ],
      "confidence": 90,
      "correct": true,
      "missedCues": [],
      "falseCues": [],
      "caughtCues": [
        "credential_request",
        "sender_domain"
      ],
      "explanation": "Nice catch -- this one was phishing. You correctly flagged: Asks for a password or payment info, Mismatched sender domain. You caught every red flag in this one.",
      "calibrationNote": "Great calibration -- you were confident and right.",
      "xpAwarded": 25,
      "leversPresent": [
        "reward",
        "curiosity"
      ],
      "attackType": "credential_harvesting",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 2
      },
      "updatedAt": {
        "$daysAgo": 2
      },
      "deletedAt": null
    }
  ],
  "reviews": [
    {
      "_id": {
        "$oid": "de000000000000000000001f"
      },
      "reviewId": {
        "$oid": "de000000000000000000001f"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "targetType": "cueType",
      "targetValue": "sender_domain",
      "dueAt": {
        "$daysAgo": 1
      },
      "interval": 1,
      "easeFactor": 2.5,
      "lastReviewedAt": {
        "$daysAgo": 2
      },
      "streak": 0,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 3
      },
      "updatedAt": {
        "$daysAgo": 3
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000020"
      },
      "reviewId": {
        "$oid": "de0000000000000000000020"
      },
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "targetType": "cueType",
      "targetValue": "credential_request",
      "dueAt": {
        "$daysAgo": 0
      },
      "interval": 1,
      "easeFactor": 2.5,
      "lastReviewedAt": {
        "$daysAgo": 2
      },
      "streak": 0,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 3
      },
      "updatedAt": {
        "$daysAgo": 3
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000021"
      },
      "reviewId": {
        "$oid": "de0000000000000000000021"
      },
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "targetType": "emotionalLever",
      "targetValue": "reward",
      "dueAt": {
        "$daysAgo": -1
      },
      "interval": 1,
      "easeFactor": 2.5,
      "lastReviewedAt": null,
      "streak": 0,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 3
      },
      "updatedAt": {
        "$daysAgo": 3
      },
      "deletedAt": null
    }
  ],
  "consents": [
    {
      "_id": {
        "$oid": "de0000000000000000000022"
      },
      "consentId": {
        "$oid": "de0000000000000000000022"
      },
      "userId": {
        "$oid": "de0000000000000000000005"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "data_processing",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000023"
      },
      "consentId": {
        "$oid": "de0000000000000000000023"
      },
      "userId": {
        "$oid": "de0000000000000000000005"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "emotional_profiling",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000024"
      },
      "consentId": {
        "$oid": "de0000000000000000000024"
      },
      "userId": {
        "$oid": "de0000000000000000000006"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "data_processing",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000025"
      },
      "consentId": {
        "$oid": "de0000000000000000000025"
      },
      "userId": {
        "$oid": "de0000000000000000000006"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "emotional_profiling",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000026"
      },
      "consentId": {
        "$oid": "de0000000000000000000026"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "data_processing",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000027"
      },
      "consentId": {
        "$oid": "de0000000000000000000027"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "emotional_profiling",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000028"
      },
      "consentId": {
        "$oid": "de0000000000000000000028"
      },
      "userId": {
        "$oid": "de0000000000000000000008"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "data_processing",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000029"
      },
      "consentId": {
        "$oid": "de0000000000000000000029"
      },
      "userId": {
        "$oid": "de0000000000000000000008"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "emotional_profiling",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000002a"
      },
      "consentId": {
        "$oid": "de000000000000000000002a"
      },
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "data_processing",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000002b"
      },
      "consentId": {
        "$oid": "de000000000000000000002b"
      },
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "emotional_profiling",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000002c"
      },
      "consentId": {
        "$oid": "de000000000000000000002c"
      },
      "userId": {
        "$oid": "de000000000000000000000a"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "data_processing",
      "policyVersion": "2026-08-1",
      "granted": true,
      "grantedAt": {
        "$daysAgo": 44
      },
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000002d"
      },
      "consentId": {
        "$oid": "de000000000000000000002d"
      },
      "userId": {
        "$oid": "de000000000000000000000a"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "policyType": "emotional_profiling",
      "policyVersion": "2026-08-1",
      "granted": false,
      "grantedAt": null,
      "revokedAt": null,
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    }
  ],
  "notifications": [
    {
      "_id": {
        "$oid": "de000000000000000000002e"
      },
      "notificationId": {
        "$oid": "de000000000000000000002e"
      },
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "type": "assignment",
      "title": "New training assigned",
      "body": "Q4 Security Training is due in two weeks.",
      "channel": "in_app",
      "read": false,
      "sentAt": {
        "$daysAgo": 10
      },
      "subjectId": {
        "$oid": "de0000000000000000000010"
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 10
      },
      "updatedAt": {
        "$daysAgo": 10
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000002f"
      },
      "notificationId": {
        "$oid": "de000000000000000000002f"
      },
      "userId": {
        "$oid": "de000000000000000000000a"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "type": "reminder",
      "title": "Training overdue",
      "body": "Q4 Security Training is past due.",
      "channel": "in_app",
      "read": false,
      "sentAt": {
        "$daysAgo": 1
      },
      "subjectId": {
        "$oid": "de0000000000000000000010"
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 1
      },
      "updatedAt": {
        "$daysAgo": 1
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000030"
      },
      "notificationId": {
        "$oid": "de0000000000000000000030"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "type": "result",
      "title": "Training complete",
      "body": "You finished Q4 Security Training.",
      "channel": "in_app",
      "read": true,
      "sentAt": {
        "$daysAgo": 1
      },
      "subjectId": {
        "$oid": "de0000000000000000000010"
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 1
      },
      "updatedAt": {
        "$daysAgo": 1
      },
      "deletedAt": null
    }
  ],
  "auditLogs": [
    {
      "_id": {
        "$oid": "de0000000000000000000032"
      },
      "auditLogId": {
        "$oid": "de0000000000000000000032"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "actorId": {
        "$oid": "de0000000000000000000005"
      },
      "action": "training.created",
      "targetType": "campaign",
      "targetId": {
        "$oid": "de0000000000000000000010"
      },
      "ip": "203.0.113.10",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 10
      },
      "updatedAt": {
        "$daysAgo": 10
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000033"
      },
      "auditLogId": {
        "$oid": "de0000000000000000000033"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "actorId": {
        "$oid": "de0000000000000000000005"
      },
      "action": "training.created",
      "targetType": "campaign",
      "targetId": {
        "$oid": "de0000000000000000000011"
      },
      "ip": "203.0.113.10",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 6
      },
      "updatedAt": {
        "$daysAgo": 6
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000034"
      },
      "auditLogId": {
        "$oid": "de0000000000000000000034"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "actorId": {
        "$oid": "de0000000000000000000005"
      },
      "action": "member.invited",
      "targetType": "invitation",
      "targetId": {
        "$oid": "de0000000000000000000031"
      },
      "ip": "203.0.113.10",
      "metadata": {},
      "createdAt": {
        "$daysAgo": 2
      },
      "updatedAt": {
        "$daysAgo": 2
      },
      "deletedAt": null
    }
  ],
  "lessonCompletions": [
    {
      "_id": {
        "$oid": "de0000000000000000000035"
      },
      "lessonCompletionId": {
        "$oid": "de0000000000000000000035"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "lessonId": "email-phishing",
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "completedAt": {
        "$daysAgo": 8
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 8
      },
      "updatedAt": {
        "$daysAgo": 8
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000036"
      },
      "lessonCompletionId": {
        "$oid": "de0000000000000000000036"
      },
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "lessonId": "smishing",
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "completedAt": {
        "$daysAgo": 5
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 5
      },
      "updatedAt": {
        "$daysAgo": 5
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000037"
      },
      "lessonCompletionId": {
        "$oid": "de0000000000000000000037"
      },
      "userId": {
        "$oid": "de0000000000000000000008"
      },
      "lessonId": "email-phishing",
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "completedAt": {
        "$daysAgo": 4
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 4
      },
      "updatedAt": {
        "$daysAgo": 4
      },
      "deletedAt": null
    }
  ],
  "surveyResponses": [
    {
      "_id": {
        "$oid": "de0000000000000000000038"
      },
      "surveyResponseId": {
        "$oid": "de0000000000000000000038"
      },
      "surveyKey": "onboarding_baseline",
      "surveyVersion": "2026-08-1",
      "purpose": "onboarding_baseline",
      "userId": {
        "$oid": "de0000000000000000000005"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "answers": [
        {
          "questionKey": "emails_per_day",
          "value": 55
        },
        {
          "questionKey": "suspicious_emails_per_day",
          "value": 2
        },
        {
          "questionKey": "password_length",
          "value": 16
        },
        {
          "questionKey": "reuses_passwords",
          "value": 0
        },
        {
          "questionKey": "uses_password_manager",
          "value": 1
        },
        {
          "questionKey": "mfa_familiar",
          "value": 1
        },
        {
          "questionKey": "mfa_enabled",
          "value": 1
        },
        {
          "questionKey": "security_training",
          "value": 1
        },
        {
          "questionKey": "clicks_links",
          "value": 7
        },
        {
          "questionKey": "opens_attachments",
          "value": 6
        },
        {
          "questionKey": "verifies_links",
          "value": 79
        },
        {
          "questionKey": "reports_suspicious",
          "value": 70
        },
        {
          "questionKey": "has_antivirus",
          "value": 1
        },
        {
          "questionKey": "uses_vpn",
          "value": 0
        },
        {
          "questionKey": "department",
          "value": "IT"
        },
        {
          "questionKey": "work_mode",
          "value": "Hybrid"
        }
      ],
      "derivedSignals": {
        "emails_per_day": 55,
        "suspicious_emails_per_day": 2,
        "password_length": 16,
        "reuses_passwords": 0,
        "uses_password_manager": 1,
        "mfa_familiar": 1,
        "mfa_enabled": 1,
        "security_training": 1,
        "clicks_links": 7,
        "opens_attachments": 6,
        "verifies_links": 79,
        "reports_suspicious": 70,
        "has_antivirus": 1,
        "uses_vpn": 0,
        "department": "IT",
        "work_mode": "Hybrid"
      },
      "baselineRiskContribution": 88,
      "completedAt": {
        "$daysAgo": 44
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de0000000000000000000039"
      },
      "surveyResponseId": {
        "$oid": "de0000000000000000000039"
      },
      "surveyKey": "onboarding_baseline",
      "surveyVersion": "2026-08-1",
      "purpose": "onboarding_baseline",
      "userId": {
        "$oid": "de0000000000000000000006"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "answers": [
        {
          "questionKey": "emails_per_day",
          "value": 55
        },
        {
          "questionKey": "suspicious_emails_per_day",
          "value": 2
        },
        {
          "questionKey": "password_length",
          "value": 16
        },
        {
          "questionKey": "reuses_passwords",
          "value": 0
        },
        {
          "questionKey": "uses_password_manager",
          "value": 1
        },
        {
          "questionKey": "mfa_familiar",
          "value": 1
        },
        {
          "questionKey": "mfa_enabled",
          "value": 1
        },
        {
          "questionKey": "security_training",
          "value": 1
        },
        {
          "questionKey": "clicks_links",
          "value": 17
        },
        {
          "questionKey": "opens_attachments",
          "value": 14
        },
        {
          "questionKey": "verifies_links",
          "value": 65
        },
        {
          "questionKey": "reports_suspicious",
          "value": 58
        },
        {
          "questionKey": "has_antivirus",
          "value": 1
        },
        {
          "questionKey": "uses_vpn",
          "value": 0
        },
        {
          "questionKey": "department",
          "value": "Finance"
        },
        {
          "questionKey": "work_mode",
          "value": "Office"
        }
      ],
      "derivedSignals": {
        "emails_per_day": 55,
        "suspicious_emails_per_day": 2,
        "password_length": 16,
        "reuses_passwords": 0,
        "uses_password_manager": 1,
        "mfa_familiar": 1,
        "mfa_enabled": 1,
        "security_training": 1,
        "clicks_links": 17,
        "opens_attachments": 14,
        "verifies_links": 65,
        "reports_suspicious": 58,
        "has_antivirus": 1,
        "uses_vpn": 0,
        "department": "Finance",
        "work_mode": "Office"
      },
      "baselineRiskContribution": 72,
      "completedAt": {
        "$daysAgo": 44
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000003a"
      },
      "surveyResponseId": {
        "$oid": "de000000000000000000003a"
      },
      "surveyKey": "onboarding_baseline",
      "surveyVersion": "2026-08-1",
      "purpose": "onboarding_baseline",
      "userId": {
        "$oid": "de0000000000000000000007"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "answers": [
        {
          "questionKey": "emails_per_day",
          "value": 55
        },
        {
          "questionKey": "suspicious_emails_per_day",
          "value": 2
        },
        {
          "questionKey": "password_length",
          "value": 10
        },
        {
          "questionKey": "reuses_passwords",
          "value": 1
        },
        {
          "questionKey": "uses_password_manager",
          "value": 0
        },
        {
          "questionKey": "mfa_familiar",
          "value": 1
        },
        {
          "questionKey": "mfa_enabled",
          "value": 0
        },
        {
          "questionKey": "security_training",
          "value": 1
        },
        {
          "questionKey": "clicks_links",
          "value": 38
        },
        {
          "questionKey": "opens_attachments",
          "value": 32
        },
        {
          "questionKey": "verifies_links",
          "value": 32
        },
        {
          "questionKey": "reports_suspicious",
          "value": 29
        },
        {
          "questionKey": "has_antivirus",
          "value": 1
        },
        {
          "questionKey": "uses_vpn",
          "value": 0
        },
        {
          "questionKey": "department",
          "value": "Finance"
        },
        {
          "questionKey": "work_mode",
          "value": "Office"
        }
      ],
      "derivedSignals": {
        "emails_per_day": 55,
        "suspicious_emails_per_day": 2,
        "password_length": 10,
        "reuses_passwords": 1,
        "uses_password_manager": 0,
        "mfa_familiar": 1,
        "mfa_enabled": 0,
        "security_training": 1,
        "clicks_links": 38,
        "opens_attachments": 32,
        "verifies_links": 32,
        "reports_suspicious": 29,
        "has_antivirus": 1,
        "uses_vpn": 0,
        "department": "Finance",
        "work_mode": "Office"
      },
      "baselineRiskContribution": 36,
      "completedAt": {
        "$daysAgo": 44
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000003b"
      },
      "surveyResponseId": {
        "$oid": "de000000000000000000003b"
      },
      "surveyKey": "onboarding_baseline",
      "surveyVersion": "2026-08-1",
      "purpose": "onboarding_baseline",
      "userId": {
        "$oid": "de0000000000000000000008"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "answers": [
        {
          "questionKey": "emails_per_day",
          "value": 55
        },
        {
          "questionKey": "suspicious_emails_per_day",
          "value": 2
        },
        {
          "questionKey": "password_length",
          "value": 10
        },
        {
          "questionKey": "reuses_passwords",
          "value": 1
        },
        {
          "questionKey": "uses_password_manager",
          "value": 0
        },
        {
          "questionKey": "mfa_familiar",
          "value": 1
        },
        {
          "questionKey": "mfa_enabled",
          "value": 0
        },
        {
          "questionKey": "security_training",
          "value": 1
        },
        {
          "questionKey": "clicks_links",
          "value": 25
        },
        {
          "questionKey": "opens_attachments",
          "value": 21
        },
        {
          "questionKey": "verifies_links",
          "value": 53
        },
        {
          "questionKey": "reports_suspicious",
          "value": 47
        },
        {
          "questionKey": "has_antivirus",
          "value": 1
        },
        {
          "questionKey": "uses_vpn",
          "value": 0
        },
        {
          "questionKey": "department",
          "value": "Finance"
        },
        {
          "questionKey": "work_mode",
          "value": "Hybrid"
        }
      ],
      "derivedSignals": {
        "emails_per_day": 55,
        "suspicious_emails_per_day": 2,
        "password_length": 10,
        "reuses_passwords": 1,
        "uses_password_manager": 0,
        "mfa_familiar": 1,
        "mfa_enabled": 0,
        "security_training": 1,
        "clicks_links": 25,
        "opens_attachments": 21,
        "verifies_links": 53,
        "reports_suspicious": 47,
        "has_antivirus": 1,
        "uses_vpn": 0,
        "department": "Finance",
        "work_mode": "Hybrid"
      },
      "baselineRiskContribution": 59,
      "completedAt": {
        "$daysAgo": 44
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000003c"
      },
      "surveyResponseId": {
        "$oid": "de000000000000000000003c"
      },
      "surveyKey": "onboarding_baseline",
      "surveyVersion": "2026-08-1",
      "purpose": "onboarding_baseline",
      "userId": {
        "$oid": "de0000000000000000000009"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "answers": [
        {
          "questionKey": "emails_per_day",
          "value": 90
        },
        {
          "questionKey": "suspicious_emails_per_day",
          "value": 2
        },
        {
          "questionKey": "password_length",
          "value": 10
        },
        {
          "questionKey": "reuses_passwords",
          "value": 1
        },
        {
          "questionKey": "uses_password_manager",
          "value": 0
        },
        {
          "questionKey": "mfa_familiar",
          "value": 1
        },
        {
          "questionKey": "mfa_enabled",
          "value": 0
        },
        {
          "questionKey": "security_training",
          "value": 1
        },
        {
          "questionKey": "clicks_links",
          "value": 33
        },
        {
          "questionKey": "opens_attachments",
          "value": 28
        },
        {
          "questionKey": "verifies_links",
          "value": 41
        },
        {
          "questionKey": "reports_suspicious",
          "value": 36
        },
        {
          "questionKey": "has_antivirus",
          "value": 1
        },
        {
          "questionKey": "uses_vpn",
          "value": 1
        },
        {
          "questionKey": "department",
          "value": "Sales"
        },
        {
          "questionKey": "work_mode",
          "value": "Remote"
        }
      ],
      "derivedSignals": {
        "emails_per_day": 90,
        "suspicious_emails_per_day": 2,
        "password_length": 10,
        "reuses_passwords": 1,
        "uses_password_manager": 0,
        "mfa_familiar": 1,
        "mfa_enabled": 0,
        "security_training": 1,
        "clicks_links": 33,
        "opens_attachments": 28,
        "verifies_links": 41,
        "reports_suspicious": 36,
        "has_antivirus": 1,
        "uses_vpn": 1,
        "department": "Sales",
        "work_mode": "Remote"
      },
      "baselineRiskContribution": 45,
      "completedAt": {
        "$daysAgo": 44
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    },
    {
      "_id": {
        "$oid": "de000000000000000000003d"
      },
      "surveyResponseId": {
        "$oid": "de000000000000000000003d"
      },
      "surveyKey": "onboarding_baseline",
      "surveyVersion": "2026-08-1",
      "purpose": "onboarding_baseline",
      "userId": {
        "$oid": "de000000000000000000000a"
      },
      "orgId": {
        "$oid": "de0000000000000000000001"
      },
      "answers": [
        {
          "questionKey": "emails_per_day",
          "value": 90
        },
        {
          "questionKey": "suspicious_emails_per_day",
          "value": 2
        },
        {
          "questionKey": "password_length",
          "value": 16
        },
        {
          "questionKey": "reuses_passwords",
          "value": 0
        },
        {
          "questionKey": "uses_password_manager",
          "value": 1
        },
        {
          "questionKey": "mfa_familiar",
          "value": 1
        },
        {
          "questionKey": "mfa_enabled",
          "value": 1
        },
        {
          "questionKey": "security_training",
          "value": 1
        },
        {
          "questionKey": "clicks_links",
          "value": 22
        },
        {
          "questionKey": "opens_attachments",
          "value": 19
        },
        {
          "questionKey": "verifies_links",
          "value": 57
        },
        {
          "questionKey": "reports_suspicious",
          "value": 50
        },
        {
          "questionKey": "has_antivirus",
          "value": 1
        },
        {
          "questionKey": "uses_vpn",
          "value": 1
        },
        {
          "questionKey": "department",
          "value": "Sales"
        },
        {
          "questionKey": "work_mode",
          "value": "Remote"
        }
      ],
      "derivedSignals": {
        "emails_per_day": 90,
        "suspicious_emails_per_day": 2,
        "password_length": 16,
        "reuses_passwords": 0,
        "uses_password_manager": 1,
        "mfa_familiar": 1,
        "mfa_enabled": 1,
        "security_training": 1,
        "clicks_links": 22,
        "opens_attachments": 19,
        "verifies_links": 57,
        "reports_suspicious": 50,
        "has_antivirus": 1,
        "uses_vpn": 1,
        "department": "Sales",
        "work_mode": "Remote"
      },
      "baselineRiskContribution": 63,
      "completedAt": {
        "$daysAgo": 44
      },
      "metadata": {},
      "createdAt": {
        "$daysAgo": 44
      },
      "updatedAt": {
        "$daysAgo": 44
      },
      "deletedAt": null
    }
  ]
};

const DAY_MS = 86400000;
const now = Date.now();
function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object") {
    if ("$oid" in value) return new ObjectId(value.$oid);
    if ("$daysAgo" in value) return new Date(now - value.$daysAgo * DAY_MS);
    if ("$randomToken" in value) return require("crypto").randomBytes(32).toString("base64url");
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = revive(inner);
    return out;
  }
  return value;
}

const docs = revive(DATA);
const env = (typeof process !== "undefined" && process.env) || {};

if (env.DEMO_SEED_REMOVE === "1") {
  for (const [collection, rows] of Object.entries(docs)) {
    const { deletedCount } = db
      .getCollection(collection)
      .deleteMany({ _id: { $in: rows.map((row) => row._id) } });
    print(`removed ${deletedCount} from ${collection}`);
  }
} else {
  const realUsers = db.getCollection("users").countDocuments({
    _id: { $nin: docs.users.map((user) => user._id) },
    isDemo: { $ne: true },
  });
  if (realUsers > 0 && env.DEMO_SEED_FORCE !== "1") {
    print(
      `[03-seed] refusing: this database has ${realUsers} real user(s). ` +
        "The demo org is for development databases. Set DEMO_SEED_FORCE=1 to seed anyway.",
    );
    quit(1);
  }
  for (const [collection, rows] of Object.entries(docs)) {
    for (const row of rows) {
      db.getCollection(collection).replaceOne({ _id: row._id }, row, { upsert: true });
    }
    print(`seeded ${rows.length} into ${collection}`);
  }
}
