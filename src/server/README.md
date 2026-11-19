# src/server

The domain rules of PhishAware: grading, progression, the adaptive practice engine, scenario
generation, the LLM layer, SSO, sessions and org data. Route handlers in `src/app/api` parse the
request, call into this folder and shape the response. This folder reaches MongoDB through `@/db`.

## Boundary

- **Imports.** `@/db`, `mongodb`, `@/lib/*` (`onboarding-survey`, `utils`, `auth-errors`),
  `node:crypto`, `zod`, and the SDKs `groq-sdk`, `@google/genai` and `openid-client`. Nothing here
  imports from `src/app` or `src/components`.
- **Next.js APIs.** Only two files use them. [http.ts](http.ts) wraps `NextResponse` in the route
  helpers (`HttpError`, `requireUserId`, `requireOrgAdmin`, `withErrorHandling`, `readJsonBody`).
  [session.ts](session.ts) uses `cookies()` from `next/headers`. Everything else takes and returns
  plain values or writes to Mongo, and much of it is pure.
- **Client imports.** `"use client"` components import `CueId` from [cues.ts](cues.ts) and
  `PRACTICE_VECTORS` from [attackProfiles.ts](attackProfiles.ts). Keep those files free of
  server-only imports.
- **Per-process state.** The login rate limiter, LLM token buckets, pool top-up guard, OIDC config
  cache and seed guard live in memory. None of them coordinates across instances.

## Module map

### Grading, review and progress

| File | Role |
| --- | --- |
| [cues.ts](cues.ts) | The eight `CueId` values, `CUE_LABELS`, `CUE_OPTIONS`. |
| [grading.ts](grading.ts) | `gradeAttempt`, `gradedCues`: verdict, caught/missed/false cues, XP, feedback. |
| [reviewSchedule.ts](reviewSchedule.ts), [spacedReview.ts](spacedReview.ts) | Spaced review: `outcomesForAttempt`, `applyReviewOutcomes`, `dueCues`; pure SM-2 maths in `nextSchedule`. |
| [leveling.ts](leveling.ts), [streak.ts](streak.ts) | `levelForXp` (intermediate at 150 XP, advanced at 400); `computeStreak`. |
| [lessons.ts](lessons.ts), [lessonCompletion.ts](lessonCompletion.ts) | Static `LESSONS`; `markLessonComplete` keeps the first completion date. |
| [onboardingQuiz.ts](onboardingQuiz.ts) | `selectQuizScenarios`: up to `ONBOARDING_QUIZ_LENGTH` (5) distinct diagnostic questions. |
| [trainingProgress.ts](trainingProgress.ts), [assignedFocus.ts](assignedFocus.ts) | Assignment progress for both employee and admin views; `activeFocusFor` steers practice. |
| [learnerAnalytics.ts](learnerAnalytics.ts), [orgAnalytics.ts](orgAnalytics.ts) | Per-learner analytics (pure); per-member accuracy and `riskLevelForAccuracy`. |

### Adaptive engine and scenario content

| File | Role |
| --- | --- |
| [attackProfiles.ts](attackProfiles.ts) | Taxonomy: 8 tactics, 10 attack types, `DEPARTMENT_ATTACK_TYPES`, `PRACTICE_VECTORS`, `pickIsPhish` (even draw), `difficultyForAwarenessScore`. |
| [attackProfileSelector.ts](attackProfileSelector.ts) | `selectAttackProfile`: the next attack type and tactic. `weaknessWeight`, `ATTACK_TYPE_TACTICS`. |
| [scenarioFit.ts](scenarioFit.ts) | `targetDifficulty` (how hard) and `selectScenario` (which pooled scenario). |
| [consent.ts](consent.ts) | Consent policies, `CONSENT_POLICY_VERSION`, the `mayProfileEmotionally` gate. |
| [scenarioGenerator.ts](scenarioGenerator.ts) | `generatePhishingScenario`: two-stage LLM draft and refine; `VECTOR_ALLOWED_CUES`. |
| [scenarioPool.ts](scenarioPool.ts) | `topUpPoolInBackground`: aims for `POOL_TARGET_SIZE` (6) unattempted generated scenarios per vector. |
| [personalize.ts](personalize.ts) | `NAME_TOKEN`, `normalizePlaceholders`, serve-time `personalizeScenario`. |
| [seedScenarios.ts](seedScenarios.ts), [seed.ts](seed.ts) | Static `SEED_SCENARIOS`; `seedIfEmpty` upserts scenarios, lessons and sample users, one run at a time. |

### LLM layer ([llm/](llm/))

| File | Role |
| --- | --- |
| [llm/llmComplete.ts](llm/llmComplete.ts) | `complete()`, the only entry point: Groq, then Gemini, else `null`. |
| [llm/groqClient.ts](llm/groqClient.ts), [llm/geminiClient.ts](llm/geminiClient.ts) | Lazy clients (null without an API key); `GROQ_LANE_MODELS`, `GROQ_LANE_MAX_TOKENS`, `GEMINI_MODEL`. |
| [llm/rateLimiter.ts](llm/rateLimiter.ts) | Token-budget admission control, one bucket per provider and model. |
| [chatbot.ts](chatbot.ts) | `getChatbotReply`: the in-app assistant, `chat` lane, interactive priority. |

### SSO / OIDC ([sso/](sso/)) and auth

| File | Role |
| --- | --- |
| [sso/provisioning.ts](sso/provisioning.ts) | `decideSsoProvisioning`, `selectInvitation`, `SSO_REJECT_MESSAGES`. Pure. |
| [sso/oidc.ts](sso/oidc.ts) | `validateIssuer`, `discoverMetadata`, cached `configurationFor`. |
| [sso/idToken.ts](sso/idToken.ts), [sso/domain.ts](sso/domain.ts) | `extractIdentity`, `displayName`; `normalizeEmail`, `domainAllowed` (exact match, no subdomains). |
| [sso/pkce.ts](sso/pkce.ts), [sso/cookies.ts](sso/cookies.ts), [sso/redirect.ts](sso/redirect.ts) | Verifier, state and nonce; `SSO_STATE_COOKIE`; `safeRedirectPath`. |
| [secretBox.ts](secretBox.ts) | AES-256-GCM for SSO client secrets under `APP_ENCRYPTION_KEY`, read lazily. |
| [session.ts](session.ts) | `phishaware_session` cookie: 30-day sessions, 1-hour guests; `deleteAccount`, guest purges. |
| [password.ts](password.ts), [codeDelivery.ts](codeDelivery.ts) | scrypt hashing, uniform 6-digit `generateResetCode`; optional reset-code webhook. |
| [loginLockout.ts](loginLockout.ts), [rateLimit.ts](rateLimit.ts) | Durable lock after `MAX_FAILED_ATTEMPTS` (5) for `LOCKOUT_MS` (30 min); in-process IP + email throttle. |
| [audit.ts](audit.ts), [redact.ts](redact.ts), [siteUrl.ts](siteUrl.ts) | `recordAudit`; `redactEmail` for logs; public origin and `ssoRedirectUri`. |

### Organizations, owned data and ML

| File | Role |
| --- | --- |
| [org.ts](org.ts), [invitations.ts](invitations.ts) | `toOrgDto`, `seatUsage`; `INVITATION_TTL_MS` (14 days), `invitationState`. |
| [orgBranding.ts](orgBranding.ts), [orgWorkspace.ts](orgWorkspace.ts) | Strict validation of admin-supplied branding; `workspaceForMember`. |
| [departments.ts](departments.ts) | Org-owned departments, started from the ten standard names. |
| [notifications.ts](notifications.ts) | `notifyOnce`: at most one row per (user, type, subject). |
| [ownedData.ts](ownedData.ts) | Which collections cascade when a user or an org is deleted. |
| [users.ts](users.ts), [dto.ts](dto.ts) | `buildUserDoc` for new users; `toUserDto`. |
| [mlClient.ts](mlClient.ts) | `predictAwareness`: POST to `${ML_SERVICE_URL}/predictions/awareness`; throws `MlServiceError`. |

## Key flows

### Grading a practice attempt

`POST /api/practice/attempts` calls `gradeAttempt(scenario, verdict, selectedCues, confidence)`.
`gradedCues` keeps cues at or above `GRADED_CUE_SEVERITY_FLOOR` (3), highest first, up to
`MAX_GRADED_CUES` (4). If none reach the floor, it keeps the single highest. Selections are
de-duplicated. A false cue is one the scenario does not list at all, so picking a real but minor
cue costs nothing. A correct verdict earns 15 XP, plus 5 per caught cue, minus 2 per false cue. A
wrong verdict earns 5. XP never goes below 0. The route then stores the attempt with the scenario's
`emotionalLevers` and `attackType`, updates the review schedule, and applies `computeStreak` and
`levelForXp`.

### Choosing the next scenario

`GET /api/practice/next` makes three separate decisions.

1. **What kind of attack.** `selectAttackProfile` gets `personalised` from
   `mayProfileEmotionally`. Without consent the mode is `unprofiled`: a random department-eligible
   attack type, then a random tactic from `ATTACK_TYPE_TACTICS`. With consent, fewer than
   `MIN_WEIGHTED_HISTORY` (5) classified attempts means `cold_start` (random). After that, 30% of
   draws (`EXPLORATION_RATE`) are `exploration` (random). The rest are `weakness_targeting`: a
   weighted draw over attack types, then over that type's tactics, by
   `weaknessWeight = 1 + 4·errorRate + 2·overconfidenceRate + 2/(attempts+1) + min(1.5, days/30)`.
   An overconfident error is a wrong answer at confidence 65 or more.
2. **How hard.** `targetDifficulty` is a staircase. Below `MIN_HISTORY_FOR_ADAPTION` (3) attempts
   it keeps the onboarding level. Otherwise it steps up one level when decayed accuracy over the
   last 8 attempts reaches `STEP_UP_ABOVE` (0.85) or after 3 correct in a row, and down one at
   `STEP_DOWN_BELOW` (0.6). A campaign's `minDifficulty` is a floor.
3. **Which scenario.** `selectScenario` scores pooled candidates by `WEIGHT`: level mismatch,
   recent repeats, phish/legit imbalance, missing campaign or review cues, and a phishing
   candidate that isn't the chosen attack type (3) or doesn't use the chosen tactic (1). Ties
   break randomly.

The attack type and tactic from step 1 also feed generation: the background top-up, or a live
`generatePhishingScenario(params, "interactive")` call when no candidate exists. In pool selection
their combined weight (4) stays below one level of mismatch (5) and the review term (6), so they
steer among scenarios that already fit. Legitimate candidates take the best phishing candidate's
profile cost, so the profile never changes the phishing/legitimate mix.

### LLM calls and failover

All model calls go through `complete()`, with a lane (`draft`, `refine`, `chat`) and a priority
(`interactive` by default, or `background`). Each model in `GROQ_LANE_MODELS[lane]` is its own
token bucket. When one cannot admit the call, the next is tried. After Groq, `GEMINI_MODEL` is tried
once. Each call times out after `STAGE_TIMEOUT_MS` (20 s). A 429 or a missing model puts that
bucket into backoff. If everything fails, `complete` returns `null`, so every caller needs a
non-LLM fallback. The limiter allows one call in flight per bucket and keeps `INTERACTIVE_RESERVE`
(25%) of each bucket away from background work.

`generatePhishingScenario` drafts at temperature 1.0, refines at 0.4, parses with Zod and caps cues
at 4. A legitimate scenario gets no cues. A phishing scenario left with none returns `null`. The
model's cues are filtered through `VECTOR_ALLOWED_CUES`, the same table the refine prompt offers.

### Who SSO lets in

The callback route does the I/O. It requires the `SSO_STATE_COOKIE` value to match `state`, and it
consumes the `ssoStates` row once. `openid-client` validates the tokens with `configurationFor`,
which caches per connection for an hour and refreshes discovery after 24 hours. `extractIdentity`
keeps an absent `email_verified` as `null`. Google connections also need the `hd` claim in
`allowedDomains`. Then `decideSsoProvisioning` checks, in order:

1. The email domain is allowed.
2. `email_verified: false` is rejected. An absent claim passes only when the connection lists
   allowed domains, because Entra never sends it.
3. An existing member logs in, unless disabled.
4. Otherwise the invitation must be pending, unexpired and within the seat limit. An accepted
   invitation with no member row is `not_a_member`.
5. An org-less account with that email is adopted. Otherwise a user is created.

With no member and no invitation, the result is `not_a_member`. `selectInvitation` picks a live
pending invitation first, then the newest row.

## Invariants

- **Enums in lockstep.** `CueId`, `PersuasionTacticId`, `AttackTypeId` and `PRACTICE_VECTORS` must
  match `CUE`, `LEVER`, `ATTACK_TYPE` and `VECTOR` in `src/db/provision.ts` (and so in the generated
  `database/init/01-validators.js`). Vectors also appear in `src/api-spec/openapi.yaml` and in `VECTOR_BRIEF`.
  [vectorTaxonomy.test.ts](vectorTaxonomy.test.ts) checks vectors only. A test also holds
  `DEPARTMENT_ATTACK_TYPES` keys equal to `DEPARTMENTS` in `src/lib/onboarding-survey.ts`.
- **Consent gate.** `personalised` defaults to `false`; an absent decision is not permission. Only
  a granted `emotional_profiling` row on the current `CONSENT_POLICY_VERSION` counts. Bumping the
  version asks everyone again. Revoking sets `revokedAt` instead of deleting the row.
- **Taxonomy comes from code.** `emotionalLevers` and `attackType` come from the selector, never
  from the model. The seed library must obey `VECTOR_ALLOWED_CUES` (see
  [seedScenarios.test.ts](seedScenarios.test.ts)).
- **No real names in stored scenarios.** The pool is shared. Store `NAME_TOKEN` and substitute at
  serve time.
- **Store what was graded.** Callers persist `GradedAttempt.selectedCues`, the de-duplicated list,
  not the raw request array.
- **Newest first.** `scenarioFit` reads array position as recency.
- **Ownership lists.** A test requires every provisioned collection with a `userId` or `orgId` to
  appear in an [ownedData.ts](ownedData.ts) list.
- **Never throw into the caller.** `recordAudit`, `applyReviewOutcomes`, `workspaceForMember` and
  `notifyOnce` log failures and return.
- **IdP errors become `HttpError`.** `withErrorHandling` treats messages containing "connect" or
  "timed out" as a database outage, so [sso/oidc.ts](sso/oidc.ts) rethrows network failures.

## Testing

Tests sit next to the code as `*.test.ts`. `mlClient.integration.test.ts` starts its own local
HTTP server. Pure modules accept injected `random`, `rng` or `now`. Run from the repository root:

```bash
bun run test                            # all tests under ./src, each file isolated
bun run test src/server/grading.test.ts # one file
```

Shared test doubles live in `src/test/`. Every `mock.module()` call goes through
`mock-module-registry.ts`, and an ESLint rule blocks direct calls elsewhere. `mock-mongo.ts` is an
in-memory `@/db`. `mock-next-headers.ts` and `mock-session.ts` fake cookies and sessions.
`mock-scenario-generator.ts`, `mock-sso-oidc.ts` and `mock-openid-client.ts` keep tests off real
providers. `env.ts` saves and restores `process.env` keys. LLM tests share
[llm/test-provider-mock.ts](llm/test-provider-mock.ts), which fakes the Groq and Gemini clients, so
the real `complete()` runs.
