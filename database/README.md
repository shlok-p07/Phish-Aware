# database

The MongoDB schema as `mongosh` scripts: the shared cross-team copy, and a way
to provision a database without running the app. The `$jsonSchema` validators
make the database itself reject a document with a wrong type, a bad enum value
or a missing required field (`validationAction: "error"`).

**`01-validators.js` and `02-indexes.js` are generated** from
[`src/db/provision.ts`](../src/db/provision.ts), the schema the app applies to
itself on first connect, so the two can't disagree. Don't edit them by hand:
[`src/db/mongoshExport.test.ts`](../src/db/mongoshExport.test.ts) fails when
they're out of date.

## Files

| File | What it does | Safe to re-run |
| --- | --- | --- |
| [`init/01-validators.js`](init/01-validators.js) | Generated. Creates each of the app's 19 collections with its validator, or updates the validator with `collMod` if the collection exists | Yes |
| [`init/02-indexes.js`](init/02-indexes.js) | Generated. Creates the app's indexes (foreign keys, unique constraints, TTLs, one unique index per named primary key), then drops known-stale ones | Yes |
| [`init/03-seed.js`](init/03-seed.js) | Hand-written starter dataset from the original team spec | No. See below |

## Running them

```bash
bun run db:init      # runs 01-validators.js then 02-indexes.js against MONGODB_URI from .env
```

`db:init` needs `mongosh` installed. It applies exactly what the app applies on
startup, so it's safe against a database the app already uses, and you only
need it to provision a database before the app has run against it.

To run a single file:

```bash
mongosh "$MONGODB_URI" database/init/01-validators.js
```

### `03-seed.js` is out of date

`03-seed.js` predates the current schema. It writes `profiles` and `surveys`,
which the app no longer uses, and `surveyResponses` keyed by `surveyId`, which
the current validator rejects (it requires `surveyKey` and `surveyVersion`).
It also wipes the collections it seeds first. Nothing runs it. The app seeds
itself through [`src/server/seed.ts`](../src/server/seed.ts) (`bun run db:seed`).
Never point it at real data.

## Changing the schema

1. Edit [`src/db/provision.ts`](../src/db/provision.ts) and the model in
   [`src/db/models/`](../src/db/models/). The step-by-step is in
   [src/db/README.md](../src/db/README.md).
2. Run `bun run db:export-schema` to regenerate `01-validators.js` and
   `02-indexes.js`, and commit them with the change.
3. If you changed an enum that the app also defines, update that copy too. For
   example, cue types are mirrored in
   [`src/server/cues.ts`](../src/server/cues.ts) and persuasion levers in
   [`src/server/attackProfiles.ts`](../src/server/attackProfiles.ts); both
   files say so in their header comments.

Until 2026-11 the mongosh scripts were hand-maintained, and they had drifted
from `provision.ts`. The hand-written versions, including notes on where they
departed from the team spec, are in git history.
