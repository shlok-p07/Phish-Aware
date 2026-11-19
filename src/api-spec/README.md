# src/api-spec

The HTTP contract between the browser and the route handlers. `openapi.yaml` is the single
source of truth: orval generates both the client and the validation schemas from it.

```text
openapi.yaml ──(bun run codegen)──┬─> src/api-client/generated/   React Query hooks + TS types
                                  └─> src/api-zod/generated/      Zod schemas + TS types
```

`bun run codegen` runs `orval --config ./src/api-spec/orval.config.ts`, which has two
targets. Both set `clean: true`, so each run deletes and rewrites its `generated/` folder.

| Target | Output | Notes |
| --- | --- | --- |
| `api-client-react` | `src/api-client/generated/api.ts` (fetchers and hooks), `api.schemas.ts` (types) | `client: "react-query"`, `baseUrl: "/api"`, and every request goes through the `customFetch` mutator. |
| `zod` | `src/api-zod/generated/api.ts` (schemas), `generated/types/` (one type per file) | Query and path params are coerced from strings to `boolean`, `number` and `string`. |

## The spec

`openapi.yaml` is OpenAPI 3.1.0 with one server, `/api`. It has 45 paths and 57
operations, grouped by tags such as `auth`, `practice`, `org` and `sso`. Shared shapes live
under `components.schemas`. Do not change `info.title`: `orval.config.ts` forces it to `Api`
because the barrels import from `generated/api`.

`GET /auth/sso/start` and `GET /auth/sso/callback` exist in `src/app/api` but are left out
of the spec on purpose. Both answer with a 302 redirect. A generated hook would `fetch()` them
and fail with a CORS error on the cross-origin redirect, so the UI navigates to them with
`window.location.href`. The comment at the top of `paths:` explains this.

## Generated files: never edit by hand

Everything under `src/api-client/generated/` and `src/api-zod/generated/`. Every file's
header says "Do not edit manually", and edits are lost on the next codegen. The generated
files are committed to git. ESLint ignores both folders.

## Hand-written files

| File | Purpose |
| --- | --- |
| `src/api-client/custom-fetch.ts` | `customFetch`, the fetch wrapper every generated call uses. It sets a JSON `content-type` on JSON string bodies, returns `null` for empty responses (204, 205, 304), and throws `ApiError` (with `status`, `data`, `url`) on any non-2xx response or `ResponseParseError` on bad JSON. `setBaseUrl` and `setAuthTokenGetter` exist, but the file warns against the token getter in web apps: the browser sends the session cookie itself. |
| `src/api-client/index.ts` | Barrel. Re-exports `generated/api`, `generated/api.schemas`, `setBaseUrl` and `setAuthTokenGetter`. |
| `src/api-zod/index.ts` | Barrel. Re-exports `generated/api` and `generated/types`. |
| `src/lib/api-error.ts` | `errorStatus()` and `errorCode()`, for reading a failed request in the UI. |

Import from the barrels, `@/api-client` and `@/api-zod`, never from `generated/`.

## Naming

Names come from each operation's `operationId`:

- `operationId: submitAttempt` gives `submitAttempt()` (plain fetcher), `useSubmitAttempt()`
  (hook) and, in `@/api-zod`, `SubmitAttemptBody` and `SubmitAttemptResponse`.
- A GET such as `getCurrentUser` also gets `getGetCurrentUserQueryKey()` and
  `getGetCurrentUserQueryOptions()`. Query strings get `<Operation>QueryParams` in `@/api-zod`.

## How handlers use the Zod schemas

Handlers that import `@/api-zod` parse the body on the way in and the response on the way out:

```ts
const body = SignupBody.parse(await readJsonBody(req));
// ...
return json(parseResponse(SignupResponse, toUserDto(user)), { status: 201 });
```

The helpers come from `src/server/http.ts`. `withErrorHandling` turns a request `ZodError`
into a 400 `{ error: "Invalid request", details }`. A response that fails `parseResponse` is a
server bug, so it is logged and returned as a 500.

Only 20 of the 47 `route.ts` files import `@/api-zod`: six `auth` routes (`guest`, `login`,
`me`, `signup`, both `password-reset`), `chatbot`, `dashboard`, `healthz`, `readyz`,
`leaderboard`, `lessons`, `onboarding`, `practice` and `profile`. The others, including
`org/*`, `invitations/*`, `notifications`, `consents` and `training`, cast any body with
`readJsonBody<T>()` and validate fields by hand, with helpers such as `optionalText()` and
the parsers in `src/server/orgBranding.ts`. Their hooks are still generated from the spec.

## Adding or changing an endpoint

1. Edit `openapi.yaml`. Give the operation a unique `operationId` and put request and
   response shapes in `components.schemas`.
2. Run `bun run codegen`. Commit the regenerated `generated/` folders with the spec change.
3. Implement or update `src/app/api/<path>/route.ts`. Path params use folder names such as
   `[id]`. Wrap the handler in `withErrorHandling`, and parse with the generated
   `<Operation>Body` and `<Operation>Response` schemas.
4. Call the hook from a page or component, imported from `@/api-client`. After a mutation,
   invalidate the affected queries with their `get<Operation>QueryKey()`. Then run
   `bun run typecheck` to check every caller against the new types.

`src/server/vectorTaxonomy.test.ts` reads `openapi.yaml` to check that the practice vector
enum matches the rest of the code. It is the only test that reads the spec.

See also [`../app/api/README.md`](../app/api/README.md) for the route handlers and
[`../components/README.md`](../components/README.md) for how components use the hooks.
