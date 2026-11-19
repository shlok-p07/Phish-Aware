# src/db

MongoDB access for PhishAware. This folder holds the connection, the schema the app installs on itself, one typed module per collection, and three command-line scripts. Import from `@/db`; [`index.ts`](index.ts) re-exports the client, [`objectId.ts`](objectId.ts) and every model.

| File | What it does |
| --- | --- |
| [`client.ts`](client.ts) | Connects, provisions the schema, starts seeding. Exports `getDb`, `getCollection`, `getMongoClient`, `closeMongoClient` |
| [`provision.ts`](provision.ts) | The schema, written once: `ensureSchema`, `ensureIndexes`, `provisionDatabase` |
| [`mongoshExport.ts`](mongoshExport.ts) | Renders the mongosh scripts in [`database/init/`](../../database/init/) from `provision.ts` and `demoDataset.ts` (`bun run db:export-schema`) |
| [`demoDataset.ts`](demoDataset.ts) | The demo organisation behind `database/init/03-seed.js`, typed against the models |
| [`objectId.ts`](objectId.ts) | `toObjectId` returns `null` on malformed input, so a route can answer 400 or 404 instead of throwing |
| [`models/`](models/) | One file per collection (table below) |
| `seed-cli.ts`, `migrate-invited-users.ts`, `sso-demo.ts` | Command-line scripts (see below) |

The seed content lives in [`src/server/seed.ts`](../server/seed.ts), not here.

## Connecting

| Variable | Required | Default |
| --- | --- | --- |
| `MONGODB_URI` | Yes | none. The first real use throws `MONGODB_URI must be set` |
| `MONGODB_DB` | No | `phishaware` |

The connection is lazy. Importing `@/db` does nothing, because Next.js evaluates the module graph at build time and the Docker build stage has no `MONGODB_URI`. The first call to `getDb()`, `getCollection()` or `getMongoClient()` connects. The client promise is cached on `globalThis`, so a dev hot reload does not open a new pool or provision again.

Use `getMongoClient()` only when you need a transaction across collections. [`src/app/api/invitations/[token]/accept/route.ts`](../app/api/invitations/[token]/accept/route.ts) is the example in the code.

A script must call `closeMongoClient()` before it exits. It waits for in-flight seeding and the index-drift report first; closing under them prints spurious "not connected" errors.

## Provisioning on first connect

On first connect, `client.ts` awaits `provisionDatabase()` before it hands back the client, so no write can run against an older validator. It then starts seeding without awaiting it. This happens once per process. If provisioning fails, the error is logged and rethrown, so `getDb()` rejects.

- **`ensureSchema`** calls `make()` once per collection. `make()` builds a `$jsonSchema` validator, adds `metadata`, `createdAt`, `updatedAt` and `deletedAt`, and adds the collection's named primary key from the `PK` map (an ObjectId mirroring `_id`; a string slug for `lessons`). It uses `collMod` if the collection exists and `createCollection` if not. Every validator uses `validationLevel: "moderate"` and `validationAction: "error"`. No validator sets `additionalProperties: false`, so unlisted fields are stored but not checked.
- **`ensureIndexes`** calls `createIndex` for each index, plus a unique `<pk>_pk` index on every named primary key. `createIndex` is a no-op when nothing changed.
- **Removing an index** takes more than deleting its line, because `createIndex` never drops anything. Add the index name to `STALE_INDEXES`; it is dropped on boot.
- **Drift report.** After indexing, the app logs any index on a managed collection that `provision.ts` did not create. It never drops one, because the cluster is shared.

## The mongosh copy in `database/init/`

`provision.ts` is the only place the schema is written. The mongosh scripts in [`database/init/`](../../database/init/), the copy shared with other teams, are generated from it: [`mongoshExport.ts`](mongoshExport.ts) runs `ensureSchema` and `ensureIndexes` against a recording stand-in for the driver and prints what they would apply. After any schema change, run `bun run db:export-schema` and commit the regenerated files. [`mongoshExport.test.ts`](mongoshExport.test.ts) fails until you do.

Some enums are also mirrored in TypeScript. `CueId` in [`src/server/cues.ts`](../server/cues.ts) must match `CUE`, and [`src/server/vectorTaxonomy.test.ts`](../server/vectorTaxonomy.test.ts) checks that `VECTOR` in `provision.ts` covers every practice vector. `WORK_TYPE` is built from `WORK_MODES` in `src/lib/onboarding-survey.ts`.

Moderate validation does not recheck stored documents. A document that breaks a new rule stays put, and its next update is rejected. After a schema change, run `bun run db:verify`. It runs provisioning twice to check that the second pass creates nothing, then counts the stored documents each validator rejects.

## Models

Each file exports a `XDoc` interface, an `InsertX` type, an `X_COLLECTION` name and an `xCollection()` accessor built on `getCollection`. Most docs extend `SpecConventions` and carry a named primary key that mirrors `_id`.

| File | Primary key | Holds |
| --- | --- | --- |
| [`assignments.ts`](models/assignments.ts) | `assignmentId` | One user's assignment to a campaign: status and progress |
| [`attempts.ts`](models/attempts.ts) | `attemptId` | One verdict on a scenario, with caught, missed and false cues |
| [`auditLogs.ts`](models/auditLogs.ts) | `auditLogId` | Privileged actions in an org. `AuditAction` lists them |
| [`campaigns.ts`](models/campaigns.ts) | `campaignId` | Org training campaigns. `focus` limits which practice counts |
| [`consents.ts`](models/consents.ts) | `consentId` | Versioned `data_processing` and `emotional_profiling` consent. Revoking sets `revokedAt` |
| [`departments.ts`](models/departments.ts) | `departmentId` | Org-owned departments. `users.department` (a name) stays the read path |
| [`invitations.ts`](models/invitations.ts) | `invitationId` | Offers of org membership. The effective status comes from `invitationState()` in `src/server/invitations.ts` |
| [`lessonCompletions.ts`](models/lessonCompletions.ts) | `lessonCompletionId` | One row per learner per lesson. `lessonId` is a slug |
| [`lessons.ts`](models/lessons.ts) | `lessonId` (string slug, same as `_id`) | Lessons and their screen types |
| [`notifications.ts`](models/notifications.ts) | `notificationId` | In-app notices. `subjectId` lets one be deduplicated per subject |
| [`organizations.ts`](models/organizations.ts) | `orgId` | Org name, domain and settings |
| [`reviews.ts`](models/reviews.ts) | `reviewId` | Spaced-repetition schedule per learner per cue, lever or vector |
| [`scenarios.ts`](models/scenarios.ts) | `scenarioId` | Practice messages, `library` or `ai_generated`. `orgId: null` is the global library |
| [`sessions.ts`](models/sessions.ts) | none | Session tokens. No `SpecConventions`. TTL index on `expiresAt` |
| [`specConventions.ts`](models/specConventions.ts) | n/a | The shared `SpecConventions` fields and `specDefaults(now)` |
| [`ssoConnections.ts`](models/ssoConnections.ts) | `ssoConnectionId` | One org's OIDC provider. The client secret is encrypted and kept out of `organizations` on purpose |
| [`ssoStates.ts`](models/ssoStates.ts) | none | In-flight OIDC requests, consumed once. 10-minute TTL; callers must also check `expiresAt` |
| [`surveyResponses.ts`](models/surveyResponses.ts) | `surveyResponseId` | Append-only intro-survey submissions, keyed by `surveyKey` and `surveyVersion` |
| [`users.ts`](models/users.ts) | `userId` | Accounts, guests and demo fixtures, with survey, score, reset and lockout fields |

`provision.ts` also creates `deliveries`, which has no model file.

## Seeding

`seedIfEmpty()` in [`src/server/seed.ts`](../server/seed.ts) runs on every first connect, not only on an empty database:

- **Scenarios** from `SEED_SCENARIOS` are upserted with `$setOnInsert`, matched on source, vector, sender and subject. Existing rows, including AI-generated ones, are left alone.
- **Lessons** from `src/server/lessons.ts` are inserted if missing, and rewritten only when their content differs from the stored copy.
- **Six sample leaderboard users** (`orgId: null`, `isDemo: true`) are upserted by email. `passwordHash` is always set to `null`, so they cannot sign in.

`client.ts` starts the seed on first connect, and `seed-cli.ts` calls it directly. A shared promise on `globalThis` keeps it to one run per process. Two processes booting at once can still race.

[`database/init/03-seed.js`](../../database/init/03-seed.js) is separate: an opt-in demo organisation (`bun run db:seed:demo`), generated from [`demoDataset.ts`](demoDataset.ts). It upserts fixed demo ids only and refuses a database with real users; see [database/README.md](../../database/README.md#the-demo-organisation-03-seedjs).

## Command-line scripts

Each runs through `tsx --env-file=.env`, so it reads `.env`.

| Script | File | What it does |
| --- | --- | --- |
| `bun run db:seed` | [`seed-cli.ts`](seed-cli.ts) | Runs `seedIfEmpty()`, then `closeMongoClient()` |
| `bun run db:migrate-invites` | [`migrate-invited-users.ts`](migrate-invited-users.ts) | Turns legacy `users` rows (`status: "invited"`, `passwordHash: null`) into invitations, and deletes those rows. Dry run by default; add `-- --apply` to write. Kept out of provisioning because it deletes users |
| `bun run sso:demo` | [`sso-demo.ts`](sso-demo.ts) | Drives the app's HTTP API to create a demo org and admin, save an SSO connection, run the preflight checks, enable SSO and invite an employee. Needs `bun run dev` running and `SSO_TEST_ISSUER`, `SSO_TEST_CLIENT_ID`, `SSO_TEST_CLIENT_SECRET`. `SSO_DEMO_BASE_URL` overrides `http://localhost:3000`. Add `-- --reset` to delete the demo org first |

## Adding a field

1. Add it to the doc interface in `models/`. Make it optional if older rows will not have it, as `users.ts` does for the lockout fields.
2. If the database should check its type or enum, add it to the `make()` call in `provision.ts`. Add it to `required` only if every stored document already has it.
3. If you query on it, add the index to `ensureIndexes`.
4. Run `bun run db:export-schema` and commit the regenerated `database/init/` files.
5. Run `bun run db:verify` against a database.

## Adding a collection

1. Create `models/<name>.ts` by copying an existing model. Extend `SpecConventions` and add a named primary key, unless the data is transient and internal, like `sessions` and `ssoStates`.
2. Export it from [`index.ts`](index.ts).
3. In `provision.ts`, add the `PK` entry, a `make()` call and its indexes. Then run `bun run db:export-schema`.
4. If it has a `userId` or `orgId` field, add it to one of the lists in [`src/server/ownedData.ts`](../server/ownedData.ts). `ownedData.test.ts` reads `provision.ts` and fails until you do.
5. Add it to [`src/test/mock-mongo.ts`](../test/mock-mongo.ts): an array in `fakeDbState`, a line in `resetFakeDbState`, and an accessor in `installMongoMock`. `mock-mongo.test.ts` fails if an accessor is missing.

## Testing

Unit tests never use a real database. `installMongoMock()` from [`src/test/mock-mongo.ts`](../test/mock-mongo.ts) replaces `@/db` with in-memory collections backed by `fakeDbState`. Call `resetFakeDbState()` in `beforeEach`. The fake supports a subset of operators and throws on any other; add the operator to the fake rather than work around it. It does not model transactions, but it counts `startSession` and `endSession` calls in `fakeDbState.sessionCalls`. See [`src/test/README.md`](../test/README.md). No unit test runs `provision.ts` against MongoDB; `bun run db:verify` is the check that does.
