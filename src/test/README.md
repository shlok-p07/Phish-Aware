# src/test

Shared test doubles and runner setup. Nothing here ships in the app.

## Two runners

The runner is chosen by file extension, not by directory.

| Runner | Files | Config | Commands |
| --- | --- | --- | --- |
| `bun test` | `*.test.ts`, `*.test.tsx` | [`bunfig.toml`](../../bunfig.toml): discovers tests under `./src`, preloads [`setup/happydom.ts`](setup/happydom.ts) | `bun test` (also `bun run test`) |
| Vitest | `*.vitest.tsx` | [`vitest.config.ts`](../../vitest.config.ts): `happy-dom` environment, setup file [`setup/vitest-setup.ts`](setup/vitest-setup.ts), `restoreMocks: true` | `bun run test:ui`, `bun run test:ui:watch`, `bun run test:coverage` |

`bun run test:all` runs both. Bun's default globs do not match `.vitest.`, so no file runs twice.

`bun test` covers domain logic, API route handlers and helpers. Its root is `./src` so that it does not also run the source copies CDK stages in `infra/cdk.out/`. The happy-dom preload registers `window` and `document` as globals, so component tests can render with Testing Library. A component test under `bun test` must add `afterEach(cleanup)` itself.

Vitest covers DOM-rendering component tests. Its setup file adds the jest-dom matchers and runs `cleanup()` after every test. `test:coverage` reports on `src/components/` only, excluding `src/components/ui/`.

Some UI tests still run under `bun test`. They use the shared doubles below, which call Bun's `mock.module()`. Vitest's `vi.mock()` is hoisted to the top of each test file and cannot be called from a helper, so those tests stay on Bun until their mocking is restructured. Every installer in this folder goes through `mock-module-registry.ts`, which imports `bun:test`, so none of them work under Vitest. Use `vi` from `vitest` in a `.vitest.tsx` file.

## Test doubles

Each double exports mutable state, a reset function and an installer. Install at the top of the test file and reset in `beforeEach`. Repeat installs are no-ops, so every test file that needs a double can call its installer.

| File | Installer | Replaces | Use it when |
| --- | --- | --- | --- |
| [`mock-mongo.ts`](mock-mongo.ts) | `await installMongoMock()` | `@/db`: every collection accessor, `getDb`, `getMongoClient` | Code reads or writes MongoDB. Seed `fakeDbState.<collection>` arrays |
| [`mock-session.ts`](mock-session.ts) | `await installSessionMock()` | `createSession` and `getUserIdFromRequest` in `@/server/session` | A route needs a signed-in user. Set `fakeSessionState.userId`; `null` means signed out |
| [`mock-next-headers.ts`](mock-next-headers.ts) | `await installNextHeadersMock()` | `cookies()` in `next/headers`, which throws outside a request | Code sets or reads cookies. Inspect `fakeCookieState.jar` and `deleted` |
| [`mock-next-navigation.ts`](mock-next-navigation.ts) | `installNextNavigationMock()` | `usePathname`, `useSearchParams`, `useRouter` | A page or component uses routing |
| [`mock-api-client.ts`](mock-api-client.ts) | `installApiClientMock()` | The generated React Query hooks in `@/api-client` | A page calls API hooks. Set data and mutation handlers on `apiClientMockState` |
| [`mock-openid-client.ts`](mock-openid-client.ts) | `await installOpenidClientMock()` | `authorizationCodeGrant` and `fetchUserInfo` in `openid-client` | SSO callback tests. Both throw until a test configures them |
| [`mock-sso-oidc.ts`](mock-sso-oidc.ts) | `await installSsoOidcMock()` | `configurationFor` in `@/server/sso/oidc`, which does a real HTTPS discovery | SSO callback tests |
| [`mock-scenario-generator.ts`](mock-scenario-generator.ts) | `await installScenarioGeneratorMock()` | `generatePhishingScenario` in `@/server/scenarioGenerator` | A test must not reach an LLM provider. `fakeGeneratorState` can return a result, return `null`, throw, or hold the call open with `gate` |
| [`env.ts`](env.ts) | n/a | Nothing. Exports `captureEnv`, `restoreEnv`, `setEnv` | A test changes `process.env` |
| [`bson-schema.ts`](bson-schema.ts) | n/a | Nothing. Exports `checkBsonSchema(doc, $jsonSchema)` | A test needs to know whether a document would pass a collection's validator. Throws on keywords it doesn't implement |

Use `env.ts` to undo an env change. Assigning `undefined` to a `process.env` key stores the string `"undefined"`, and that value leaks into every later test file in the run.

`mock-mongo.ts`, `mock-session.ts`, `mock-openid-client.ts` and `mock-sso-oidc.ts` spread the real module and override only some exports. For `@/db` this means any accessor left out would reach the real database, so [`mock-mongo.test.ts`](mock-mongo.test.ts) fails if one is missing. The Mongo fake also throws on any query or update operator it does not implement. Add the operator to `mock-mongo.ts` instead of working around it in your test.

## Why `installModuleMock()` and not `mock.module()`

Bun's `mock.module()` is process-global and cannot be undone. It does not rebind imports that were already resolved. If two test files install different fakes for the same module, import order decides which one wins. Both files pass alone, and one fails in the full run. That happened with `@/db`.

[`mock-module-registry.ts`](mock-module-registry.ts) enforces one fake per module path for the whole process. `installModuleMock(specifier, owner, factory)` installs the first claim, ignores repeat claims from the same owner, and throws when a different owner claims the same path. The fix for that error is to extend the existing double, not to add a second one.

- Write `specifier` the way the code under test imports it, for example `@/db`. Bun resolves a relative path against the registry file, not against your installer.
- Set `owner` to the installer's own module path, for example `@/test/mock-mongo`.

An ESLint `no-restricted-syntax` rule in [`eslint.config.mjs`](../../eslint.config.mjs) bans `mock.module()` in every file except `mock-module-registry.ts`. To add a new double, copy an existing one: exported state, a reset function, and an installer that calls `installModuleMock`.

## Dates

The [root README](../../README.md#testing) says tests that depend on the date pin a fixed `NOW` or use dates far in the past or future, so they do not fail as the calendar moves.

- If the code takes a `now` argument, pass a constant. [`src/server/loginLockout.test.ts`](../server/loginLockout.test.ts) uses `const NOW = new Date("2026-08-06T12:00:00.000Z")`.
- If the code reads the clock itself, use dates nowhere near today. [`src/app/api/training/route.test.ts`](../app/api/training/route.test.ts) uses `2099-01-01` for a campaign not yet due and `2020-01-01` for an overdue one.

## Example: a route test

Trimmed from [`src/app/api/auth/account/route.test.ts`](../app/api/auth/account/route.test.ts). Install the doubles with top-level `await`, then import the route dynamically, so the route binds to the fakes and not to the real modules.

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { fakeDbState, installMongoMock, resetFakeDbState } from "@/test/mock-mongo";
import { installSessionMock, fakeSessionState, resetFakeSessionState } from "@/test/mock-session";
import { installNextHeadersMock, resetFakeCookieState } from "@/test/mock-next-headers";

await installMongoMock();
await installSessionMock();
await installNextHeadersMock();

const { DELETE } = await import("./route");

const ME = new ObjectId();

describe("DELETE /api/auth/account", () => {
  beforeEach(() => {
    resetFakeDbState();
    resetFakeSessionState();
    resetFakeCookieState();
  });

  it("deletes the account and everything attached to it", async () => {
    fakeDbState.users.push({ _id: ME, userId: ME, name: "Me", isGuest: false });
    fakeSessionState.userId = ME;
    fakeDbState.attempts.push({ _id: new ObjectId(), userId: ME, correct: true });

    const res = await DELETE();

    expect(res.status).toBe(204);
    expect(fakeDbState.users).toHaveLength(0);
    expect(fakeDbState.attempts).toHaveLength(0);
  });
});
```

The original file puts the user seeding in a `seedMe()` helper. It is inlined here.
