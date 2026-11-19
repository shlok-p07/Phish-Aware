# src

The Next.js 15 app: pages, API route handlers, domain logic and the MongoDB layer. This
page tells you where things live. Each linked README covers its folder in detail.

## Top-level folders

| Folder | Purpose | README |
| --- | --- | --- |
| `app/` | App Router pages and layouts, plus the route handlers in `app/api/`. | [app/api/README.md](app/api/README.md) |
| `server/` | Domain logic used by route handlers: grading, sessions, scenario generation, org rules, the LLM layer (`llm/`), OIDC SSO (`sso/`), and the route helpers in `http.ts`. | [server/README.md](server/README.md) |
| `db/` | MongoDB client, collection models, schema provisioning, and the seed and migration CLIs. | [db/README.md](db/README.md) |
| `components/` | React components. shadcn/ui primitives in `ui/`, the practice simulators in `practice/`. | [components/README.md](components/README.md) |
| `api-spec/` | `openapi.yaml` and the orval config. The source of the two generated folders below. | [api-spec/README.md](api-spec/README.md) |
| `api-client/` | Generated React Query hooks (`generated/`, do not edit), plus the hand-written `custom-fetch.ts`. | [api-spec/README.md](api-spec/README.md) |
| `api-zod/` | Generated Zod schemas (`generated/`, do not edit) that route handlers parse with. | [api-spec/README.md](api-spec/README.md) |
| `hooks/` | Client React hooks. | |
| `lib/` | Small modules with no server or database imports, used by both client and server code. | |
| `test/` | Shared test doubles and runner setup. | [test/README.md](test/README.md) |

`globals.d.ts` only declares `*.css` modules.

## Routes in `src/app`

| Path | URL | Notes |
| --- | --- | --- |
| `page.tsx` | `/` | The landing page. A server component: it reads the session and redirects signed-in users to `/dashboard`. |
| `(app)/` | `/dashboard`, `/learn`, `/learn/[id]`, `/practice`, `/leaderboard`, `/profile`, `/settings`, `/admin/...` | The signed-in app. The group name is not part of the URL. `(app)/layout.tsx` renders `Layout` from `components/layout.tsx`, which sends users with no session to `/auth` and users who have not finished onboarding to `/onboarding`. `admin/` has its own layout and pages for members, analytics, training, settings and org creation. |
| `auth/` | `/auth` | Sign in, sign up and the SSO entry point. |
| `invite/[token]/` | `/invite/<token>` | Public invitation accept page. |
| `onboarding/` | `/onboarding` | The intro survey and diagnostic quiz. |
| `api/` | `/api/...` | Route handlers, one `route.ts` per path. |

The root `layout.tsx` loads the fonts with `next/font`, sets metadata and wraps everything
in `providers.tsx` (theme, accessibility settings, React Query, tooltips, toaster).
`globals.css`, `not-found.tsx`, `robots.ts`, `sitemap.ts` and `icon.svg` sit alongside it.

## Imports

`tsconfig.json` maps `@/*` to `./src/*`, and `vitest.config.ts` sets the same alias. Import
across folders with `@/`, for example `@/server/http` or `@/components/ui/button`. Import the
API client and schemas through their barrels, `@/api-client` and `@/api-zod`.

## Layering

Requests flow browser → `app` → `server` → `db`, in practice like this:

- **Pages and components** run in the browser. Every page except `/` starts with
  `"use client"`, as do all files in `hooks/` and most components. They reach the backend
  only over HTTP, through the generated hooks in `@/api-client`.
- **Route handlers** in `app/api` call `server/` for domain rules and also query `db/`
  directly: 42 of the 47 `route.ts` files import `@/db`.
- **`server/`** imports `db/` (27 files) and never imports `app/`, `components/`,
  `api-client/` or `hooks/`.
- **`db/`** models import only types from `server/` (`CueId`, attack profile ids). The CLI
  scripts `seed-cli.ts` and `migrate-invited-users.ts` import `server/` functions.

There is no `server-only` package and no build-time guard. The boundary is a convention.
A few client files do import values from `server/`: `server/cues.ts`,
`server/attackProfiles.ts` and `server/trainingProgress.ts`. Those modules end up in the
browser bundle, so keep them free of `@/db`, runtime `mongodb` imports and Node built-ins.
If client and server both need a module, `lib/` is the usual home.

## hooks/ and lib/

| File | What it provides |
| --- | --- |
| `hooks/use-accessibility.tsx` | `AccessibilityProvider` and `useAccessibility()`: text size, reduced motion, high contrast, dyslexia font and large targets, stored in `localStorage` and applied as classes on `<html>`. |
| `hooks/use-mobile.tsx` | `useIsMobile()`: true below a 768px viewport. |
| `hooks/use-mounted.ts` | False on the server and during hydration, true afterwards. |
| `hooks/use-toast.ts` | Toast state for `components/ui/toaster.tsx`. |
| `lib/utils.ts` | `cn()` for merging Tailwind classes, `initials()`. |
| `lib/api-error.ts` | `errorStatus()` and `errorCode()` for failed requests. |
| `lib/auth-errors.ts`, `lib/sso-errors.ts` | The `code` values auth routes return, and the messages shown for each `?sso_error=` code. |
| `lib/onboarding-survey.ts` | The onboarding survey questions and their validation. |
| `lib/trainingTarget.ts` | Encodes and parses a training campaign's audience string. |

## Tests

Tests sit next to the code they cover. The runner is chosen by file name:

| Pattern | Runner | Command |
| --- | --- | --- |
| `*.test.ts`, `*.test.tsx` | `bun test`, rooted at `src/` with happy-dom preloaded (`bunfig.toml`) | `bun run test` |
| `*.vitest.ts`, `*.vitest.tsx` | Vitest with happy-dom (`vitest.config.ts`) | `bun run test:ui` |

`bun run test:all` runs both. All 17 `*.vitest.*` files are in `components/`. Domain logic,
route handlers and the page tests under `app/` use `bun test`. `test/`
holds the shared mocks (`mock-mongo.ts`, `mock-session.ts`, `mock-api-client.ts`,
`mock-next-headers.ts` and others) and the runner setup in `test/setup/`.
