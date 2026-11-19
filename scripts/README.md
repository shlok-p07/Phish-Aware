# scripts

Developer tooling that is not part of the app: a local launcher, one-off
database maintenance, and an accessibility audit. Run everything from the
repository root through its `package.json` name, which loads `.env` and the
`@/` import alias.

```text
scripts/
├── dev.sh        Local launcher: checks MongoDB, applies the schema, seeds, starts Next.js
├── db/           Database maintenance and conformance checks
└── audit/        Static audits that run without a database
```

## `dev.sh`

```bash
./scripts/dev.sh        # check MONGODB_URI, apply the app schema, seed if empty, start `next dev`
./scripts/dev.sh stop   # stop the dev server it started
```

It needs `MONGODB_URI` in `.env`, pointing at Atlas or a MongoDB you run
yourself. The schema comes from `src/db/provision.ts`, applied when
`bun run db:seed` connects, so the launcher doesn't also run `db:init`. It writes logs to `.dev-logs/next.log`. It starts only Next.js; the
ML service runs separately (see [ml-service/README.md](../ml-service/README.md)).
Most of the time `bun run dev` is enough, because the app provisions and seeds
itself on the first request.

## `db/`: maintenance and checks

Each script exists because of a specific bug, which its header comment
explains. All of them are idempotent and default to reporting rather than
changing anything: add `--dry-run` to see what a script would do, or, for
`db:prune-test-accounts`, leave off `--yes`.

| Command | File | What it does |
| --- | --- | --- |
| `bun run db:verify` | [`verify-database.ts`](db/verify-database.ts) | Reports stored documents that the current validators would reject, and checks that provisioning is idempotent. It deletes nothing, but it does apply the schema (`ensureSchema`/`ensureIndexes`), exactly as the app does on startup |
| `bun run db:export-schema` | [`export-mongosh-schema.ts`](db/export-mongosh-schema.ts) | Regenerates `database/init/01-validators.js` and `02-indexes.js` from `src/db/provision.ts`. Run after any schema change; a test fails until you do. Touches no database |
| `bun run db:prune-orphans` | [`prune-orphans.ts`](db/prune-orphans.ts) | Removes rows whose owning user or organisation no longer exists |
| `bun run db:dedupe-departments` | [`dedupe-departments.ts`](db/dedupe-departments.ts) | Keeps one department per (organisation, name), so the unique index can be created |
| `bun run db:dedupe-onboarding` | [`dedupe-onboarding-scenarios.ts`](db/dedupe-onboarding-scenarios.ts) | Removes duplicated onboarding scenarios from an early seed. Never deletes one that has attempts |
| `bun run db:normalize-sso-domains` | [`normalize-sso-domains.ts`](db/normalize-sso-domains.ts) | Reduces stored SSO domains to the bare domain; an address or `@domain` matches nothing at sign-in |
| `bun run db:migrate-work-type` | [`migrate-legacy-work-type.ts`](db/migrate-legacy-work-type.ts) | Maps the retired `Onsite` work type onto the current vocabulary |
| `bun run db:prune` | [`prune-unused-collections.ts`](db/prune-unused-collections.ts) | Drops collections the app no longer provisions, and only if they are empty |
| `bun run db:prune-test-accounts` | [`prune-test-accounts.ts`](db/prune-test-accounts.ts) | Removes throwaway accounts left by end-to-end testing. Reserved test domains only; needs `--yes` |

Run `db:verify` first: it tells you which of the others, if any, you need.

## `audit/`

| Command | File | What it does |
| --- | --- | --- |
| `bun run a11y:contrast` | [`audit-contrast.ts`](audit/audit-contrast.ts) | Checks every text/background pairing the app uses against WCAG, in light, dark and both high-contrast themes, with a spread of customer accent colours substituted in. Exits non-zero on any failure. Add `--all` to list passing pairs too |

## Adding a script

- Put it in the folder that matches its purpose, and start it with a header
  comment that says why it exists and how to run it.
- Import app code through `@/` (for example `@/db/client`) rather than relative
  paths, so the script keeps working if it moves.
- Default to a dry run for anything that writes, and make it safe to run twice.
- Register it in `package.json` under the matching prefix (`db:` or `a11y:`)
  and add a row to the table above.
