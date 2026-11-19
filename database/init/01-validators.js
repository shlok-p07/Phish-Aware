/**
 * 01-validators.js -- GENERATED from src/db/provision.ts. Do not edit by hand.
 *
 * Creates every collection with its $jsonSchema validator, or updates the
 * validator with collMod if the collection exists. Safe to re-run.
 *
 * The app applies the same schema itself on first connect; this file exists
 * for the shared cross-team spec and for anyone who prefers mongosh. To change
 * the schema, edit src/db/provision.ts and run `bun run db:export-schema`.
 * src/db/mongoshExport.test.ts fails if this file is out of date.
 *
 *   mongosh "<uri>" database/init/01-validators.js
 */
db = db.getSiblingDB("phishaware");

const COLLECTIONS = [
  {
    "name": "organizations",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "orgId",
          "name",
          "domain"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "name": {
            "bsonType": "string"
          },
          "domain": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "ssoProvider": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "settings": {
            "bsonType": "object"
          },
          "orgId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "departments",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "departmentId",
          "orgId",
          "name"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "name": {
            "bsonType": "string"
          },
          "parentId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "managerId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "departmentId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "users",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "userId",
          "orgId",
          "email",
          "name",
          "role"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "orgId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "departmentId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "email": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "passwordHash": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "ssoId": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "name": {
            "bsonType": "string"
          },
          "role": {
            "enum": [
              "admin",
              "manager",
              "employee"
            ]
          },
          "jobRole": {
            "bsonType": "string"
          },
          "managerId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "status": {
            "enum": [
              "invited",
              "active",
              "disabled"
            ]
          },
          "isDemo": {
            "bsonType": "bool"
          },
          "lastLoginAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "department": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "workType": {
            "enum": [
              "Remote",
              "Hybrid",
              "Office",
              null
            ]
          },
          "surveyFeatures": {
            "bsonType": [
              "object",
              "null"
            ]
          },
          "phishingAwarenessScore": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "phishingAwarenessModelVersion": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "phishingAwarenessComputedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "userId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "scenarios",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "scenarioId",
          "isPhish",
          "vector"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "orgId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "vector": {
            "enum": [
              "email",
              "sms",
              "voice",
              "qr",
              "social",
              "web"
            ]
          },
          "isPhish": {
            "bsonType": "bool"
          },
          "difficulty": {
            "bsonType": [
              "int",
              "long",
              "double"
            ],
            "minimum": 1,
            "maximum": 5
          },
          "sender": {
            "bsonType": "string"
          },
          "subject": {
            "bsonType": "string"
          },
          "body": {
            "bsonType": "string"
          },
          "links": {
            "bsonType": "array",
            "items": {
              "bsonType": "object",
              "required": [
                "text",
                "isSuspicious"
              ],
              "properties": {
                "text": {
                  "bsonType": "string"
                },
                "isSuspicious": {
                  "bsonType": "bool"
                }
              }
            }
          },
          "attachments": {
            "bsonType": "array",
            "items": {
              "bsonType": "object",
              "required": [
                "name",
                "isSuspicious"
              ],
              "properties": {
                "name": {
                  "bsonType": "string"
                },
                "isSuspicious": {
                  "bsonType": "bool"
                }
              }
            }
          },
          "cues": {
            "bsonType": "array",
            "items": {
              "bsonType": "object",
              "required": [
                "type",
                "severity",
                "explanation"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "sender_domain",
                    "mismatched_link",
                    "urgency_language",
                    "generic_greeting",
                    "credential_request",
                    "spelling_grammar",
                    "unexpected_attachment",
                    "suspicious_qr"
                  ]
                },
                "severity": {
                  "bsonType": [
                    "int",
                    "long",
                    "double"
                  ]
                },
                "explanation": {
                  "bsonType": "string"
                }
              }
            }
          },
          "emotionalLevers": {
            "bsonType": "array",
            "items": {
              "enum": [
                "urgency",
                "curiosity",
                "authority",
                "fear",
                "reward",
                "trust",
                "scarcity",
                "social_proof"
              ]
            }
          },
          "attackType": {
            "enum": [
              "credential_harvesting",
              "bec",
              "invoice_fraud",
              "payroll_fraud",
              "mfa_fatigue",
              "cloud_file_sharing_scam",
              "it_helpdesk_scam",
              "package_delivery_scam",
              "software_update_scam",
              "malware_delivery"
            ]
          },
          "targetRoles": {
            "bsonType": "array",
            "items": {
              "bsonType": "string"
            }
          },
          "source": {
            "enum": [
              "library",
              "ai_generated"
            ]
          },
          "isActive": {
            "bsonType": "bool"
          },
          "isOnboarding": {
            "bsonType": "bool"
          },
          "scenarioId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "lessons",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "lessonId",
          "vector",
          "title"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "vector": {
            "enum": [
              "email",
              "sms",
              "voice",
              "qr",
              "social",
              "web"
            ]
          },
          "title": {
            "bsonType": "string"
          },
          "steps": {
            "bsonType": "array"
          },
          "redFlags": {
            "bsonType": "array",
            "items": {
              "bsonType": "string"
            }
          },
          "difficulty": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "order": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "isActive": {
            "bsonType": "bool"
          },
          "lessonId": {
            "bsonType": "string"
          }
        }
      }
    }
  },
  {
    "name": "attempts",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "attemptId",
          "userId",
          "orgId",
          "scenarioId",
          "verdict",
          "correct"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "userId": {
            "bsonType": "objectId"
          },
          "orgId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "scenarioId": {
            "bsonType": "objectId"
          },
          "campaignId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "verdict": {
            "enum": [
              "phish",
              "legit"
            ]
          },
          "selectedCues": {
            "bsonType": "array",
            "items": {
              "enum": [
                "sender_domain",
                "mismatched_link",
                "urgency_language",
                "generic_greeting",
                "credential_request",
                "spelling_grammar",
                "unexpected_attachment",
                "suspicious_qr"
              ]
            }
          },
          "confidence": {
            "bsonType": [
              "int",
              "long",
              "double"
            ],
            "minimum": 0,
            "maximum": 100
          },
          "correct": {
            "bsonType": "bool"
          },
          "caughtCues": {
            "bsonType": "array",
            "items": {
              "enum": [
                "sender_domain",
                "mismatched_link",
                "urgency_language",
                "generic_greeting",
                "credential_request",
                "spelling_grammar",
                "unexpected_attachment",
                "suspicious_qr"
              ]
            }
          },
          "missedCues": {
            "bsonType": "array",
            "items": {
              "enum": [
                "sender_domain",
                "mismatched_link",
                "urgency_language",
                "generic_greeting",
                "credential_request",
                "spelling_grammar",
                "unexpected_attachment",
                "suspicious_qr"
              ]
            }
          },
          "falseCues": {
            "bsonType": "array",
            "items": {
              "enum": [
                "sender_domain",
                "mismatched_link",
                "urgency_language",
                "generic_greeting",
                "credential_request",
                "spelling_grammar",
                "unexpected_attachment",
                "suspicious_qr"
              ]
            }
          },
          "explanation": {
            "bsonType": "string"
          },
          "calibrationNote": {
            "bsonType": "string"
          },
          "leversPresent": {
            "bsonType": "array",
            "items": {
              "enum": [
                "urgency",
                "curiosity",
                "authority",
                "fear",
                "reward",
                "trust",
                "scarcity",
                "social_proof"
              ]
            }
          },
          "attackType": {
            "enum": [
              "credential_harvesting",
              "bec",
              "invoice_fraud",
              "payroll_fraud",
              "mfa_fatigue",
              "cloud_file_sharing_scam",
              "it_helpdesk_scam",
              "package_delivery_scam",
              "software_update_scam",
              "malware_delivery"
            ]
          },
          "timeToDecideMs": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "xpAwarded": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "attemptId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "lessonCompletions",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "lessonCompletionId",
          "userId",
          "lessonId",
          "completedAt"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "userId": {
            "bsonType": "objectId"
          },
          "lessonId": {
            "bsonType": "string"
          },
          "orgId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "completedAt": {
            "bsonType": "date"
          },
          "lessonCompletionId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "reviews",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "reviewId",
          "userId",
          "targetType",
          "targetValue",
          "dueAt"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "userId": {
            "bsonType": "objectId"
          },
          "orgId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "targetType": {
            "enum": [
              "cueType",
              "emotionalLever",
              "vector"
            ]
          },
          "targetValue": {
            "bsonType": "string"
          },
          "dueAt": {
            "bsonType": "date"
          },
          "interval": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "easeFactor": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "lastReviewedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "streak": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "reviewId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "campaigns",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "campaignId",
          "orgId",
          "type",
          "name",
          "createdBy"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "type": {
            "enum": [
              "training",
              "mandatory",
              "surprise_test"
            ]
          },
          "name": {
            "bsonType": "string"
          },
          "scenarioIds": {
            "bsonType": "array",
            "items": {
              "bsonType": "objectId"
            }
          },
          "lessonIds": {
            "bsonType": "array",
            "items": {
              "bsonType": "objectId"
            }
          },
          "audience": {
            "bsonType": "object"
          },
          "dueDate": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "scheduledAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "status": {
            "enum": [
              "draft",
              "scheduled",
              "active",
              "completed"
            ]
          },
          "createdBy": {
            "bsonType": "objectId"
          },
          "focus": {
            "bsonType": [
              "object",
              "null"
            ],
            "properties": {
              "vectors": {
                "bsonType": "array",
                "items": {
                  "bsonType": "string"
                }
              },
              "minDifficulty": {
                "bsonType": [
                  "int",
                  "long",
                  "double"
                ]
              },
              "cues": {
                "bsonType": "array",
                "items": {
                  "bsonType": "string"
                }
              }
            }
          },
          "target": {
            "bsonType": "string"
          },
          "requiredScenarios": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "campaignId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "assignments",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "assignmentId",
          "campaignId",
          "userId",
          "orgId",
          "status"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "campaignId": {
            "bsonType": "objectId"
          },
          "userId": {
            "bsonType": "objectId"
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "status": {
            "enum": [
              "assigned",
              "in_progress",
              "completed",
              "overdue"
            ]
          },
          "progress": {
            "bsonType": [
              "int",
              "long",
              "double"
            ],
            "minimum": 0,
            "maximum": 100
          },
          "completedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "assignmentId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "deliveries",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "deliveryId",
          "campaignId",
          "userId",
          "orgId",
          "scenarioId",
          "outcome"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "campaignId": {
            "bsonType": "objectId"
          },
          "userId": {
            "bsonType": "objectId"
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "scenarioId": {
            "bsonType": "objectId"
          },
          "sentAt": {
            "bsonType": "date"
          },
          "openedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "clickedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "reportedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "outcome": {
            "enum": [
              "pending",
              "opened",
              "clicked",
              "reported",
              "ignored"
            ]
          },
          "deliveryId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "invitations",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "invitationId",
          "orgId",
          "email",
          "token",
          "status",
          "invitedBy"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "email": {
            "bsonType": "string"
          },
          "role": {
            "enum": [
              "admin",
              "manager",
              "employee"
            ]
          },
          "departmentId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "department": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "token": {
            "bsonType": "string"
          },
          "status": {
            "enum": [
              "pending",
              "accepted",
              "expired",
              "revoked"
            ]
          },
          "invitedBy": {
            "bsonType": "objectId"
          },
          "expiresAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "acceptedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "name": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "acceptedUserId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "invitationId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "consents",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "consentId",
          "userId",
          "policyType",
          "granted"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "userId": {
            "bsonType": "objectId"
          },
          "orgId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "policyType": {
            "enum": [
              "emotional_profiling",
              "data_processing"
            ]
          },
          "policyVersion": {
            "bsonType": "string"
          },
          "granted": {
            "bsonType": "bool"
          },
          "grantedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "revokedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "consentId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "notifications",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "notificationId",
          "userId",
          "orgId",
          "type",
          "title"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "userId": {
            "bsonType": "objectId"
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "type": {
            "enum": [
              "assignment",
              "reminder",
              "result",
              "system",
              "survey"
            ]
          },
          "title": {
            "bsonType": "string"
          },
          "body": {
            "bsonType": "string"
          },
          "channel": {
            "enum": [
              "in_app",
              "email"
            ]
          },
          "read": {
            "bsonType": "bool"
          },
          "sentAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "subjectId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "notificationId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "auditLogs",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "auditLogId",
          "orgId",
          "actorId",
          "action"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "actorId": {
            "bsonType": "objectId"
          },
          "action": {
            "bsonType": "string"
          },
          "targetType": {
            "bsonType": "string"
          },
          "targetId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "ip": {
            "bsonType": "string"
          },
          "auditLogId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "surveyResponses",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "surveyResponseId",
          "surveyKey",
          "surveyVersion",
          "userId",
          "answers"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "surveyKey": {
            "bsonType": "string"
          },
          "surveyVersion": {
            "bsonType": "string"
          },
          "purpose": {
            "enum": [
              "onboarding_baseline",
              "periodic_pulse"
            ]
          },
          "userId": {
            "bsonType": "objectId"
          },
          "orgId": {
            "bsonType": [
              "objectId",
              "null"
            ]
          },
          "answers": {
            "bsonType": "array",
            "items": {
              "bsonType": "object",
              "required": [
                "questionKey",
                "value"
              ],
              "properties": {
                "questionKey": {
                  "bsonType": "string"
                }
              }
            }
          },
          "derivedSignals": {
            "bsonType": "object"
          },
          "baselineRiskContribution": {
            "bsonType": [
              "int",
              "long",
              "double"
            ],
            "minimum": 0,
            "maximum": 100
          },
          "completedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "surveyResponseId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "sessions",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "token",
          "userId",
          "expiresAt"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "token": {
            "bsonType": "string"
          },
          "userId": {
            "bsonType": "objectId"
          },
          "expiresAt": {
            "bsonType": "date"
          }
        }
      }
    }
  },
  {
    "name": "ssoConnections",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "ssoConnectionId",
          "orgId",
          "issuer",
          "clientId",
          "clientSecretEnc",
          "enabled"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "providerKind": {
            "enum": [
              "okta",
              "entra",
              "google",
              "auth0",
              "generic"
            ]
          },
          "issuer": {
            "bsonType": "string"
          },
          "clientId": {
            "bsonType": "string"
          },
          "clientSecretEnc": {
            "bsonType": "string"
          },
          "extraScopes": {
            "bsonType": "array",
            "items": {
              "bsonType": "string"
            }
          },
          "allowedDomains": {
            "bsonType": "array",
            "items": {
              "bsonType": "string"
            }
          },
          "requireVerifiedEmail": {
            "bsonType": "bool"
          },
          "enabled": {
            "bsonType": "bool"
          },
          "discovery": {
            "bsonType": [
              "object",
              "null"
            ]
          },
          "discoveryFetchedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "lastTestAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "lastTestOk": {
            "bsonType": [
              "bool",
              "null"
            ]
          },
          "lastTestError": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "configVersion": {
            "bsonType": [
              "int",
              "long",
              "double"
            ]
          },
          "ssoConnectionId": {
            "bsonType": "objectId"
          }
        }
      }
    }
  },
  {
    "name": "ssoStates",
    "validator": {
      "$jsonSchema": {
        "bsonType": "object",
        "required": [
          "state",
          "nonce",
          "codeVerifier",
          "orgId",
          "expiresAt"
        ],
        "properties": {
          "metadata": {
            "bsonType": "object"
          },
          "createdAt": {
            "bsonType": "date"
          },
          "updatedAt": {
            "bsonType": "date"
          },
          "deletedAt": {
            "bsonType": [
              "date",
              "null"
            ]
          },
          "state": {
            "bsonType": "string"
          },
          "nonce": {
            "bsonType": "string"
          },
          "codeVerifier": {
            "bsonType": "string"
          },
          "orgId": {
            "bsonType": "objectId"
          },
          "connectionId": {
            "bsonType": "objectId"
          },
          "redirectTo": {
            "bsonType": "string"
          },
          "emailHint": {
            "bsonType": [
              "string",
              "null"
            ]
          },
          "isTest": {
            "bsonType": "bool"
          },
          "expiresAt": {
            "bsonType": "date"
          }
        }
      }
    }
  }
];

const existing = new Set(db.getCollectionNames());
for (const { name, validator } of COLLECTIONS) {
  const options = { validator, validationLevel: "moderate", validationAction: "error" };
  if (existing.has(name)) {
    db.runCommand({ collMod: name, ...options });
  } else {
    db.createCollection(name, options);
  }
  print(`validator applied: ${name}`);
}
