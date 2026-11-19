# database

The original MongoDB schema for PhishAware, written as `mongosh` scripts from
the shared team spec. Its `$jsonSchema` validators make the database itself
reject a document with a wrong type, a bad enum value or a missing required
field (`validationAction: "error"`).

> **These files are behind the app.** The schema that actually runs is
> [`src/db/provision.ts`](../src/db/provision.ts), which the app applies
> idempotently on the first API request. The two are meant to be kept in
> lockstep, but they have drifted. For example, `init/` still creates `profiles` and `surveys`
> (which the app no longer uses), lacks `lessonCompletions`, and keys
> `surveyResponses` by `surveyId` where the app uses `surveyKey` and
> `surveyVersion`. For what the app does, read `provision.ts`, and see
> [src/db/README.md](../src/db/README.md).

## Files

| File | What it does | Safe to re-run |
| --- | --- | --- |
| [`init/01-validators.js`](init/01-validators.js) | Creates or updates 20 collections (17 from the shared team spec, plus the app-internal `sessions`, `ssoConnections` and `ssoStates`) with their validators. Existing collections are updated with `collMod`, so it **overwrites** the app's newer validators | Only on an empty database |
| [`init/02-indexes.js`](init/02-indexes.js) | Indexes every foreign key used in a query, plus the unique constraints (one profile per user, one email per org, a unique index on each named primary key) | Yes, `createIndex` is idempotent |
| [`init/03-seed.js`](init/03-seed.js) | A starter dataset: one org, seven users in three departments, scenarios, lessons, a campaign, attempts, consents and the onboarding survey | No. It **wipes the seeded collections first**. Never point it at real data |

## Running them manually

```bash
bun run db:init      # runs 01-validators.js then 02-indexes.js against MONGODB_URI from .env
```

`db:init` needs `mongosh` installed. **Don't run it against a database the app
already uses**: it replaces the current validators with these older ones until
the app next starts and re-applies `provision.ts`. You don't need it at all for
a new database, since the app provisions itself. `scripts/dev.sh` still runs it
on every start, and the app then re-applies its own schema.

`db:init` deliberately doesn't run the seed script; the app seeds itself
through `bun run db:seed` (Node, in [`src/db/`](../src/db/)) only when the
database is empty.

To run a single file:

```bash
mongosh "$MONGODB_URI" database/init/01-validators.js
```

## Departures from the shared team spec

`01-validators.js` documents two deliberate differences, both because this is a
public app with a guest mode rather than a purely B2B product:

- `users.orgId`, `users.email` and `attempts.orgId` may be `null`. Guests have
  no email, and guests and consumer signups have no org until they create or
  join one. The fields are still required to be present.
- `scenarios.isOnboarding` is an extra field that marks the five
  onboarding-quiz questions. It is allowed because no validator sets
  `additionalProperties: false`.

## Changing the schema

Make schema changes in [`src/db/provision.ts`](../src/db/provision.ts) and the
model in [`src/db/models/`](../src/db/models/); the step-by-step is in
[src/db/README.md](../src/db/README.md). If you change an enum that the app
also defines, update that copy too. For example, cue types are mirrored in
[`src/server/cues.ts`](../src/server/cues.ts) and persuasion levers in
[`src/server/attackProfiles.ts`](../src/server/attackProfiles.ts); both files
say so in their header comments.

Then make the same change here. The `provision.ts` header names these scripts
as the source of truth for the schema shared across teams, to be kept in
lockstep with the app. No test enforces that, which is how they drifted; the
specific differences are listed in [src/db/README.md](../src/db/README.md).
A change made only here has no effect on the running app.
