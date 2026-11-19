/**
 * 02-indexes.js -- GENERATED from src/db/provision.ts. Do not edit by hand.
 *
 * Creates every index the app relies on, then drops indexes that are known to
 * be wrong. createIndex is idempotent; a missing stale index is not an error.
 *
 * The app applies the same schema itself on first connect; this file exists
 * for the shared cross-team spec and for anyone who prefers mongosh. To change
 * the schema, edit src/db/provision.ts and run `bun run db:export-schema`.
 * src/db/mongoshExport.test.ts fails if this file is out of date.
 *
 *   mongosh "<uri>" database/init/02-indexes.js
 */
db = db.getSiblingDB("phishaware");

const INDEXES = [
  {
    "collection": "assignments",
    "keys": {
      "userId": 1,
      "status": 1
    }
  },
  {
    "collection": "assignments",
    "keys": {
      "campaignId": 1
    }
  },
  {
    "collection": "assignments",
    "keys": {
      "assignmentId": 1
    },
    "options": {
      "unique": true,
      "name": "assignmentId_pk"
    }
  },
  {
    "collection": "attempts",
    "keys": {
      "userId": 1,
      "createdAt": -1
    }
  },
  {
    "collection": "attempts",
    "keys": {
      "userId": 1,
      "attackType": 1,
      "createdAt": -1
    }
  },
  {
    "collection": "attempts",
    "keys": {
      "userId": 1,
      "leversPresent": 1,
      "createdAt": -1
    }
  },
  {
    "collection": "attempts",
    "keys": {
      "campaignId": 1
    }
  },
  {
    "collection": "attempts",
    "keys": {
      "attemptId": 1
    },
    "options": {
      "unique": true,
      "name": "attemptId_pk"
    }
  },
  {
    "collection": "auditLogs",
    "keys": {
      "orgId": 1,
      "createdAt": -1
    }
  },
  {
    "collection": "auditLogs",
    "keys": {
      "auditLogId": 1
    },
    "options": {
      "unique": true,
      "name": "auditLogId_pk"
    }
  },
  {
    "collection": "campaigns",
    "keys": {
      "orgId": 1,
      "status": 1
    }
  },
  {
    "collection": "campaigns",
    "keys": {
      "campaignId": 1
    },
    "options": {
      "unique": true,
      "name": "campaignId_pk"
    }
  },
  {
    "collection": "consents",
    "keys": {
      "userId": 1,
      "policyType": 1
    }
  },
  {
    "collection": "consents",
    "keys": {
      "consentId": 1
    },
    "options": {
      "unique": true,
      "name": "consentId_pk"
    }
  },
  {
    "collection": "deliveries",
    "keys": {
      "campaignId": 1
    }
  },
  {
    "collection": "deliveries",
    "keys": {
      "userId": 1
    }
  },
  {
    "collection": "deliveries",
    "keys": {
      "deliveryId": 1
    },
    "options": {
      "unique": true,
      "name": "deliveryId_pk"
    }
  },
  {
    "collection": "departments",
    "keys": {
      "orgId": 1,
      "name": 1
    },
    "options": {
      "unique": true,
      "collation": {
        "locale": "en",
        "strength": 2
      },
      "name": "orgId_1_name_1_ci"
    }
  },
  {
    "collection": "departments",
    "keys": {
      "orgId": 1
    }
  },
  {
    "collection": "departments",
    "keys": {
      "departmentId": 1
    },
    "options": {
      "unique": true,
      "name": "departmentId_pk"
    }
  },
  {
    "collection": "invitations",
    "keys": {
      "token": 1
    },
    "options": {
      "unique": true
    }
  },
  {
    "collection": "invitations",
    "keys": {
      "orgId": 1,
      "status": 1
    }
  },
  {
    "collection": "invitations",
    "keys": {
      "orgId": 1,
      "email": 1
    },
    "options": {
      "unique": true,
      "partialFilterExpression": {
        "status": "pending"
      }
    }
  },
  {
    "collection": "invitations",
    "keys": {
      "email": 1,
      "status": 1
    }
  },
  {
    "collection": "invitations",
    "keys": {
      "invitationId": 1
    },
    "options": {
      "unique": true,
      "name": "invitationId_pk"
    }
  },
  {
    "collection": "lessonCompletions",
    "keys": {
      "userId": 1,
      "lessonId": 1
    },
    "options": {
      "unique": true
    }
  },
  {
    "collection": "lessonCompletions",
    "keys": {
      "orgId": 1,
      "lessonId": 1
    }
  },
  {
    "collection": "lessonCompletions",
    "keys": {
      "lessonCompletionId": 1
    },
    "options": {
      "unique": true,
      "name": "lessonCompletionId_pk"
    }
  },
  {
    "collection": "lessons",
    "keys": {
      "lessonId": 1
    },
    "options": {
      "unique": true,
      "name": "lessonId_pk"
    }
  },
  {
    "collection": "notifications",
    "keys": {
      "userId": 1,
      "read": 1,
      "createdAt": -1
    }
  },
  {
    "collection": "notifications",
    "keys": {
      "notificationId": 1
    },
    "options": {
      "unique": true,
      "name": "notificationId_pk"
    }
  },
  {
    "collection": "organizations",
    "keys": {
      "domain": 1
    },
    "options": {
      "unique": true,
      "partialFilterExpression": {
        "domain": {
          "$type": "string"
        }
      }
    }
  },
  {
    "collection": "organizations",
    "keys": {
      "orgId": 1
    },
    "options": {
      "unique": true,
      "name": "orgId_pk"
    }
  },
  {
    "collection": "reviews",
    "keys": {
      "userId": 1,
      "targetType": 1,
      "targetValue": 1
    },
    "options": {
      "unique": true
    }
  },
  {
    "collection": "reviews",
    "keys": {
      "userId": 1,
      "dueAt": 1
    }
  },
  {
    "collection": "reviews",
    "keys": {
      "reviewId": 1
    },
    "options": {
      "unique": true,
      "name": "reviewId_pk"
    }
  },
  {
    "collection": "scenarios",
    "keys": {
      "orgId": 1,
      "vector": 1,
      "difficulty": 1
    }
  },
  {
    "collection": "scenarios",
    "keys": {
      "emotionalLevers": 1
    }
  },
  {
    "collection": "scenarios",
    "keys": {
      "scenarioId": 1
    },
    "options": {
      "unique": true,
      "name": "scenarioId_pk"
    }
  },
  {
    "collection": "sessions",
    "keys": {
      "token": 1
    },
    "options": {
      "unique": true
    }
  },
  {
    "collection": "sessions",
    "keys": {
      "userId": 1
    }
  },
  {
    "collection": "sessions",
    "keys": {
      "expiresAt": 1
    },
    "options": {
      "expireAfterSeconds": 0
    }
  },
  {
    "collection": "ssoConnections",
    "keys": {
      "orgId": 1
    }
  },
  {
    "collection": "ssoConnections",
    "keys": {
      "orgId": 1
    },
    "options": {
      "unique": true,
      "partialFilterExpression": {
        "enabled": true
      },
      "name": "orgId_1_enabled_unique"
    }
  },
  {
    "collection": "ssoConnections",
    "keys": {
      "allowedDomains": 1
    },
    "options": {
      "unique": true,
      "partialFilterExpression": {
        "enabled": true
      },
      "name": "allowedDomains_1_enabled_unique"
    }
  },
  {
    "collection": "ssoConnections",
    "keys": {
      "ssoConnectionId": 1
    },
    "options": {
      "unique": true,
      "name": "ssoConnectionId_pk"
    }
  },
  {
    "collection": "ssoStates",
    "keys": {
      "state": 1
    },
    "options": {
      "unique": true
    }
  },
  {
    "collection": "ssoStates",
    "keys": {
      "expiresAt": 1
    },
    "options": {
      "expireAfterSeconds": 0
    }
  },
  {
    "collection": "surveyResponses",
    "keys": {
      "userId": 1,
      "surveyKey": 1,
      "createdAt": -1
    }
  },
  {
    "collection": "surveyResponses",
    "keys": {
      "orgId": 1,
      "surveyKey": 1,
      "createdAt": -1
    }
  },
  {
    "collection": "surveyResponses",
    "keys": {
      "surveyResponseId": 1
    },
    "options": {
      "unique": true,
      "name": "surveyResponseId_pk"
    }
  },
  {
    "collection": "users",
    "keys": {
      "orgId": 1,
      "email": 1
    },
    "options": {
      "unique": true,
      "partialFilterExpression": {
        "orgId": {
          "$type": "objectId"
        },
        "email": {
          "$type": "string"
        }
      }
    }
  },
  {
    "collection": "users",
    "keys": {
      "email": 1
    },
    "options": {
      "unique": true,
      "partialFilterExpression": {
        "orgId": null,
        "email": {
          "$type": "string"
        }
      }
    }
  },
  {
    "collection": "users",
    "keys": {
      "orgId": 1,
      "role": 1
    }
  },
  {
    "collection": "users",
    "keys": {
      "departmentId": 1
    }
  },
  {
    "collection": "users",
    "keys": {
      "userId": 1
    },
    "options": {
      "unique": true,
      "name": "userId_pk"
    }
  }
];

for (const { collection, keys, options } of INDEXES) {
  db.getCollection(collection).createIndex(keys, options ?? {});
}

const STALE_INDEXES = [
  {
    "collection": "surveyResponses",
    "name": "userId_1_surveyId_1"
  },
  {
    "collection": "surveyResponses",
    "name": "orgId_1_surveyId_1"
  }
];

for (const { collection, name } of STALE_INDEXES) {
  try {
    db.getCollection(collection).dropIndex(name);
    print(`dropped stale index ${collection}.${name}`);
  } catch (e) {
    if (e.code !== 27) throw e; // 27: IndexNotFound, already gone
  }
}

print(`indexes applied: ${INDEXES.length}`);
