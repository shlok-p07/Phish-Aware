# Contributing to PhishAware

This guide covers how to get a working checkout, where code goes, and what has
to pass before a change is merged. The [README](README.md) explains what the
product does; each major folder has its own README with the details for that
area.

## Setup

You need [Bun](https://bun.sh/) 1.3 or later, Node.js 22, and a MongoDB
connection string (the [Atlas](https://www.mongodb.com/atlas) free tier is
enough).

```bash
bun install
cp .env.example .env        # set MONGODB_URI; add GROQ_API_KEY / GEMINI_API_KEY for AI features
bun run dev                 # http://localhost:3000
```

The app provisions its schema and seeds sample data on the first request, so
there is no separate database setup step. To work on the ML service you also
need Python 3.12 (see [ml-service/README.md](ml-service/README.md)). For
infrastructure changes, see [infra/README.md](infra/README.md).

## Where code goes

| Change | Location | Read first |
| --- | --- | --- |
| A page or UI | `src/app/`, `src/components/` | [src/components/README.md](src/components/README.md) |
| An API endpoint | `src/api-spec/openapi.yaml`, then `src/app/api/` | [src/api-spec/README.md](src/api-spec/README.md), [src/app/api/README.md](src/app/api/README.md) |
| Business rules (grading, leveling, scenario choice, SSO) | `src/server/` | [src/server/README.md](src/server/README.md) |
| A collection or field | `src/db/provision.ts` and `src/db/models/`, then `bun run db:export-schema` | [src/db/README.md](src/db/README.md) |
| The awareness model or its API | `ml-service/` | [ml-service/README.md](ml-service/README.md) |
| Hosting | `infra/` | [infra/README.md](infra/README.md) |
| A maintenance or audit script | `scripts/` | [scripts/README.md](scripts/README.md) |

Two rules that are easy to miss:

- **Generated code is never edited by hand.** `src/api-client/generated/` and
  `src/api-zod/generated/` come from the OpenAPI spec. Change the spec and run
  `bun run codegen`, then commit the regenerated files with it.
- **The schema is written once, in `src/db/provision.ts`.** The `mongosh`
  scripts in `database/init/` are generated from it: run
  `bun run db:export-schema` after a schema change and commit the result.

## Before you open a pull request

Run the same checks as CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
bun run lint
bun run typecheck
bun test                 # unit and route tests
bun run test:ui          # component tests (Vitest)
bun run a11y:contrast    # if you touched colours or themes
bun run build
```

For changes under `ml-service/`, run `python -m pytest` there. For changes
under `infra/`, run `bun run typecheck && bun run test` there.

### Tests

- Put tests next to the code they cover: `foo.ts` → `foo.test.ts`, component
  tests as `*.vitest.tsx`. The test doubles are described in
  [src/test/README.md](src/test/README.md).
- Mock modules with `installModuleMock()` from `@/test/mock-module-registry`,
  not `mock.module()`. ESLint enforces this.
- Don't let a test depend on today's date. Pin a fixed `NOW`, or use dates far
  in the past or future.
- Don't let a test depend on a gitignored file, such as the trained model.
  Tests that need the real artifact belong in `ml-service/tests/integration/`,
  which runs only with `RUN_MODEL_INTEGRATION=1`.

## Branches and commits

- Branch from `main` and open a pull request back into it.
- Write commit subjects as a short imperative sentence that says what changed
  and, where it isn't obvious, why. For example, "Stop the training route test
  expiring with the calendar".
- Keep unrelated changes in separate commits.

## Secrets and data

Never commit `.env` files, `infra/cdk.local.json`, datasets or model
artifacts. All of them are gitignored; check `git status` before you commit.
The repository is public.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.
