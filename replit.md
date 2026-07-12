# PhishAware

An AI-education web app that trains people to spot phishing through a gamified, simulated inbox — no real emails, links, or credentials are ever involved.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/phishaware run dev` — run the web frontend
- `pnpm run typecheck` — full typecheck across all packages (run `pnpm -w run typecheck:libs` first after any `lib/db` schema change, or dependents typecheck against stale `dist` types)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, custom email/password + guest-session auth (httpOnly cookie, scrypt password hashing) — no third-party auth provider
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v3` in generated client code — see Gotchas), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Frontend: React + Vite, wouter routing, TanStack Query, Tailwind, recharts
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract (auth, onboarding, lessons, practice, dashboard, profile, leaderboard)
- `lib/db/src/schema/` — `users`, `sessions`, `scenarios`, `attempts` tables
- `artifacts/api-server/src/lib/` — core game logic: `cues.ts` (12-value CueId taxonomy), `grading.ts` (rule-based attempt grading), `seedScenarios.ts` (12 hand-authored email scenarios), `lessons.ts` (static Learn library content), `leveling.ts`, `streak.ts`
- `artifacts/phishaware/src/pages/` — auth, onboarding, dashboard, practice, learn/lesson, profile, leaderboard

## Architecture decisions

- **No AI/LLM dependency.** The user declined the OpenAI integration upgrade, so grading and scenario content are fully deterministic: a seeded scenario bank + rule-based `gradeAttempt()`. This satisfies the "graceful fallback" requirement and means the app works with zero API keys. A real LLM adversary/grader could be added later if the user supplies their own key (not yet requested).
- **Practice loop MVP is email-only.** Other vectors (sms/voice/qr/social/website) are covered in the Learn library content but not in the interactive practice loop, per original scope.
- Lessons are static in-memory content, not a DB table — there's no authoring UI for them yet.
- Cue taxonomy is a fixed 12-value enum shared across seed data, backend grading, and the OpenAPI schema — any new cue must be added in all three places (`cues.ts`, `openapi.yaml` CueId enum, `seedScenarios.ts` usages).

## Product

- Onboarding diagnostic quiz → starting level (beginner/intermediate/advanced)
- Learn library covering 6 phishing vectors
- Practice loop: simulated email inbox → verdict + cue selection + confidence slider → graded feedback with explanation and calibration note
- Dashboard (XP, streak, strong/weak cues), profile analytics (cue accuracy, vector accuracy, calibration, progress trend), leaderboard, badges

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Orval + zod v3: do not use `format: email` (or other zod-v4-only static methods like `.email()`) in `openapi.yaml` — the installed zod is v3.25.x. Use plain `type: string` with `minLength`/`maxLength` instead.
- After changing `lib/db` schema, run `pnpm -w run typecheck:libs` before typechecking dependent packages (e.g. `api-server`), or they'll fail against stale compiled `dist` type declarations.
- wouter v3: a route pattern like `/:rest*` does **not** match the bare root path `/`. Use `*` as the catch-all pattern if the route must also match `/`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
