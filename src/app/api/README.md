# `src/app/api/`: route handlers

This folder holds the Next.js App Router route handlers that make up PhishAware's
JSON API. Each `route.ts` exports one function per HTTP method, and its path under
this folder is its URL under `/api`. The UI calls these routes through React Query
hooks that are generated from [`openapi.yaml`](../../api-spec/openapi.yaml).

Related: [src/server/README.md](../../server/README.md) for the domain logic,
[src/api-spec/README.md](../../api-spec/README.md) for codegen, and
[src/test/README.md](../../test/README.md) for the test doubles.

## What lives here, and what doesn't

Each handler does the HTTP work for its route. It checks the session, parses the
input, runs the queries and returns the response. Most handlers query MongoDB
directly through the collection accessors in [`@/db`](../../db/index.ts), such as
`usersCollection()`.

Don't assume every route is thin. Sizes range from 6 lines
([`healthz`](healthz/route.ts)) to about 300
([`auth/sso/callback`](auth/sso/callback/route.ts)). Some business rules live inline:
the lockout handling in [`auth/login`](auth/login/route.ts), the seat-limit
transaction in [`invitations/[token]/accept`](invitations/[token]/accept/route.ts),
and scenario selection in [`practice/next`](practice/next/route.ts).

Reusable or independently testable logic lives in [`src/server/`](../../server/).
That covers grading, leveling, consent, invitations, audit, lockout, rate limiting,
the ML client and SSO. When you write logic that another route or a test could use,
put it there. Pages, the generated clients and the Python `ml-service/` are not in
this folder.

## Route groups

All paths are relative to `/api`.

| Group | Paths | Purpose | Auth |
| --- | --- | --- | --- |
| Health | `healthz`, `readyz` | `healthz` reports that the process is up. `readyz` runs one Mongo read and always returns 200 with a status body. | Public |
| Auth | `auth/signup`, `login`, `logout`, `me`, `guest`, `account`, `password-reset/request`, `password-reset/confirm` | Password accounts, one-hour guest sessions, account deletion, reset codes. | Mostly public; `me` and `account` need a session |
| SSO sign-in | `auth/sso/discover`, `auth/sso/start`, `auth/sso/callback` | Per-org OIDC. `start` and `callback` are browser navigations that end in a 302. | Public |
| Onboarding | `onboarding/quiz`, `onboarding/submit` | The diagnostic quiz. `submit` calls the ML service through [`mlClient.ts`](../../server/mlClient.ts). | Session |
| Lessons | `lessons`, `lessons/[id]`, `lessons/[id]/complete` | The learn library, and marking a lesson finished. | `complete` needs a session; the others don't |
| Practice | `practice/next`, `practice/attempts`, `practice/cue-options` | Serve a scenario, grade an attempt, list the selectable cues. | Session; `cue-options` is public |
| Learner | `dashboard`, `profile/analytics`, `leaderboard`, `training`, `notifications`, `consents`, `chatbot` | The signed-in user's own data, assigned training, consent choices and the assistant. | Session |
| Invitations | `invitations/[token]`, `invitations/[token]/accept` | Look up and accept an invitation. | Public |
| Org | `org` | Read your org (`GET`), create one and become its admin (`POST`), delete it (`DELETE`). | Session; `DELETE` needs an admin |
| Org admin | `org/settings`, `org/members/…`, `org/invitations/[id]/…`, `org/departments/…`, `org/training/…`, `org/analytics`, `org/audit`, `org/sso`, `org/sso/test` | Members, invitations, departments, training campaigns, analytics, audit trail, SSO setup. | Org admin |

## The handler pattern

The shared helpers are in [`src/server/http.ts`](../../server/http.ts). Every
handler here is wrapped in `withErrorHandling`.

- **Session:** there is no `middleware.ts`, so each handler checks for itself.
  `requireUserId()` throws a 401. `requireOrgAdmin()` throws a 401 if signed out
  and a 403 if the caller is not an org admin. `optionalUserId()` returns `null`
  when signed out. Admin routes scope their queries by `admin.orgId`.
- **Input:** `readJsonBody(req)` turns malformed JSON into a 400. Some routes parse
  the body with a generated schema, such as `LoginBody.parse(...)` from `@/api-zod`.
  Others, including all `org/*` routes, `consents` and `notifications`, cast the
  body and check fields by hand with `optionalText()` and `toObjectId()`.
- **Output:** return `json(data)`, or `json(parseResponse(Schema, data))` to
  validate against the generated response schema. Don't use `Schema.parse` for a
  response: its `ZodError` would be reported as the client's fault. For an
  expected failure, return `error(status, message)` or throw
  `new HttpError(status, message, code?)`.
- **Errors:** `withErrorHandling` shapes each error as JSON:
  - an `HttpError` becomes `{ error }`, or `{ error, code }` when a code is set
  - a response that fails `parseResponse` is logged and becomes 500
  - any other `ZodError` (request parsing) becomes 400 `{ error: "Invalid request", details }`
  - an error that looks like a lost database connection becomes 503
  - anything else becomes 500
- **Rate limiting:** `rateLimit(key, limit, windowMs)` and `clientIp()` come from
  [`rateLimit.ts`](../../server/rateLimit.ts). The counters are in memory and per
  instance, so they slow probing down but are not access control. Login, both
  password-reset routes, SSO `discover` and `start`, and `invitations/[token]`
  use them.
- **Audit:** admin actions call `recordAudit()` from
  [`audit.ts`](../../server/audit.ts) after the action succeeds. A new action needs
  an entry in `AuditAction` in [`auditLogs.ts`](../../db/models/auditLogs.ts).
- **Consent:** policies are defined in [`consent.ts`](../../server/consent.ts).
  `practice/next` calls `mayProfileEmotionally()`. Without that consent, it uses
  the department profile instead of the user's own.
- **Guests:** `auth/guest` creates an `isGuest` user with a one-hour session.
  `auth/signup` converts a current guest in place, so their progress carries over.
  `auth/sso/start` ends the current session and deletes the user if they were a
  guest.

SSO `start` and `callback` don't return JSON errors. They redirect to
`/auth?sso_error=<code>`, and `callback` catches every error itself.

The smallest complete model is [`chatbot/route.ts`](chatbot/route.ts):

```ts
export const POST = withErrorHandling(async (req: NextRequest) => {
  await requireUserId();
  const body = SendChatbotMessageBody.parse(await readJsonBody(req));

  const reply = await getChatbotReply(body.messages as ChatMessage[]);
  if (reply === null) {
    return error(503, "The assistant is temporarily unavailable. Please try again shortly.");
  }

  return json(parseResponse(SendChatbotMessageResponse, { reply }));
});
```

For an admin route with org scoping and an audit entry, see
[`org/departments`](org/departments/route.ts). Nearly every route also exports
`dynamic = "force-dynamic"`.

## The OpenAPI spec

[`openapi.yaml`](../../api-spec/openapi.yaml) describes every route here except SSO
`start` and `callback`. A note at the top of the spec says why: they are browser
navigations, and a generated `fetch` hook would fail on the cross-origin redirect.

`bun run codegen` runs orval with [`orval.config.ts`](../../api-spec/orval.config.ts).
It writes Zod schemas to [`src/api-zod/generated/`](../../api-zod/) for the handlers,
and React Query hooks to [`src/api-client/generated/`](../../api-client/) for the UI.
Schema names come from the `operationId`, so `operationId: login` produces
`LoginBody` and `LoginResponse`. Both folders are committed, so don't edit them by
hand. Don't change the spec's `info.title` either, because the import paths
depend on it.

To add or change a route:

1. Edit the path, `operationId` and schemas in `openapi.yaml`.
2. Run `bun run codegen` and commit the regenerated files.
3. Write the `route.ts` using the pattern above.
4. Put reusable logic in `src/server/` and give it its own `*.test.ts`.
5. Add a `route.test.ts` next to the handler.
6. Run `bun run test`, `bun run typecheck` and `bun run lint`.

Nothing checks that a handler matches its spec entry beyond its use of the
generated schemas.

## Tests

Route tests sit next to their handler as `route.test.ts`; 22 of the 47 routes have
one. A test installs its fakes, imports the handler, and calls it directly with a
`NextRequest`. [`org/departments/route.test.ts`](org/departments/route.test.ts) is
a good example.

| Double in [`src/test/`](../../test/) | What it fakes |
| --- | --- |
| [`mock-mongo.ts`](../../test/mock-mongo.ts) | `@/db` as in-memory collections, seeded through `fakeDbState`. It does not model real transactions. |
| [`mock-session.ts`](../../test/mock-session.ts) | `@/server/session`. Set `fakeSessionState.userId` to sign a caller in. |
| [`mock-next-headers.ts`](../../test/mock-next-headers.ts) | The `next/headers` cookie jar. |
| [`mock-openid-client.ts`](../../test/mock-openid-client.ts), [`mock-sso-oidc.ts`](../../test/mock-sso-oidc.ts) | The OIDC token exchange and IdP discovery for the SSO callback. |
| [`mock-scenario-generator.ts`](../../test/mock-scenario-generator.ts) | `@/server/scenarioGenerator`, so tests never call an LLM provider. |
| [`env.ts`](../../test/env.ts) | `captureEnv` and `restoreEnv`, which really unset a variable. |

Bun's `mock.module()` applies to the whole test run and can't be undone. Install
every mock through `installModuleMock()` in
[`mock-module-registry.ts`](../../test/mock-module-registry.ts); an ESLint rule
blocks direct calls. In `beforeEach`, reset shared state with `resetFakeDbState()`,
`resetFakeSessionState()` and, for rate-limited routes, `__resetRateLimits()`. Set
`NODE_ENV` and other environment variables inside each test, not at module scope.

```bash
bun run test               # unit and route tests, isolated; bunfig.toml limits discovery to ./src
bun run test src/app/api   # route tests only
bun run test:all           # bun tests, then the Vitest component suite
```
