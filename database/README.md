# database

The MongoDB schema as `mongosh` scripts: the shared cross-team copy, and a way
to provision a database without running the app. The `$jsonSchema` validators
make the database itself reject a document with a wrong type, a bad enum value
or a missing required field (`validationAction: "error"`).

**All three files are generated, so don't edit them by hand.**
`01-validators.js` and `02-indexes.js` come from
[`src/db/provision.ts`](../src/db/provision.ts), the schema the app applies to
itself on first connect, and `03-seed.js` from
[`src/db/demoDataset.ts`](../src/db/demoDataset.ts). Tests fail when any of
them is out of date; `bun run db:export-schema` regenerates them.

## Files

| File | What it does | Safe to re-run |
| --- | --- | --- |
| [`init/01-validators.js`](init/01-validators.js) | Generated. Creates each of the app's 19 collections with its validator, or updates the validator with `collMod` if the collection exists | Yes |
| [`init/02-indexes.js`](init/02-indexes.js) | Generated. Creates the app's indexes (foreign keys, unique constraints, TTLs, one unique index per named primary key), then drops known-stale ones | Yes |
| [`init/03-seed.js`](init/03-seed.js) | Generated. Adds a demo organisation with members, campaigns, attempts and more (see below) | Yes |

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

### The demo organisation (`03-seed.js`)

`03-seed.js` adds Northwind Trading Co.: six members in three departments, a
mandatory campaign and a surprise test with a full funnel, graded practice
attempts, spaced-review rows, consents, notifications, an audit trail, a
pending invitation and onboarding survey responses. Use it to see the admin
and analytics views with data in them.

```bash
bun run db:seed:demo           # add or refresh the demo org in the MONGODB_URI database
bun run db:seed:demo:remove    # remove it again
```

It's safe to run:

- **It never deletes or rewrites anything else.** Every demo document has a
  fixed `_id` and is upserted, so re-running refreshes the demo and touches
  nothing outside it. Removal deletes exactly those ids.
- **It refuses production.** If the database has any user other than these
  members and the app's `isDemo` leaderboard fixtures, it exits with an error.
  Set `DEMO_SEED_FORCE=1` to override, for example on a shared staging copy.
- **Nothing in it can be used to sign in.** No member has a password, and the
  invitation token is generated fresh on each run, never committed.
- **Dates stay current.** They're stored relative to when the script runs, so
  the open campaign is due two weeks after you seed, whenever that is.

The data is built with the app's own code where the app has some: members
with `buildUserDoc`, attempts graded by `gradeAttempt`, levels from
`levelForXp`. So the demo can't contradict how the app behaves.
[`src/db/demoDataset.test.ts`](../src/db/demoDataset.test.ts) checks every
document against the live validators and every reference against the rest of
the dataset, and runs the generated script against an in-memory stand-in for
mongosh.

## Checking against a real MongoDB

```bash
bun run db:check-init    # needs Docker
```

[`scripts/db/check-init-scripts.sh`](../scripts/db/check-init-scripts.sh) runs
all three scripts in mongosh against a throwaway `mongo:7` container. It
checks that the schema applies and re-applies, that the seed passes the real
validators and is idempotent, that the guard refuses a database with a real
user, and that removal leaves only that user. CI runs it on every pull request.

## Changing the schema

1. Edit [`src/db/provision.ts`](../src/db/provision.ts) and the model in
   [`src/db/models/`](../src/db/models/). The step-by-step is in
   [src/db/README.md](../src/db/README.md).
2. Run `bun run db:export-schema` to regenerate the scripts, and commit them
   with the change. If the change affects documents in the demo dataset,
   update [`src/db/demoDataset.ts`](../src/db/demoDataset.ts) too; its test
   fails if a demo document no longer passes the validators.
3. If you changed an enum that the app also defines, update that copy too. For
   example, cue types are mirrored in
   [`src/server/cues.ts`](../src/server/cues.ts) and persuasion levers in
   [`src/server/attackProfiles.ts`](../src/server/attackProfiles.ts); both
   files say so in their header comments.

Until 2026-11 these scripts were hand-maintained. They had drifted from
`provision.ts`, and the old seed wiped 17 collections before inserting. The
hand-written versions, including notes on where they departed from the team
spec, are in git history.
