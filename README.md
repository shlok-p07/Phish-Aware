# PhishAware

**Train yourself to spot phishing before it costs you.**

PhishAware is a gamified security-awareness training app. It drops you into a
simulated inbox where you judge whether messages are phishing or legitimate,
flag the specific red-flag *cues*, and rate your confidence — then get instant,
personalized feedback. Nothing you interact with is real: there are no live
emails, links, or credential prompts anywhere in the app.

## Features

- **Bite-sized lessons** covering phishing across email, SMS (smishing), voice
  (vishing), QR codes (quishing), social media, and fake websites.
- **Realistic practice** in a Gmail-like inbox — pick red flags, set a
  confidence level, and get graded feedback.
- **Personal analytics** — accuracy over time, per-cue and per-vector
  breakdowns, and a calibration score that measures how well your confidence
  matches your correctness.
- **Gamification** — XP, levels, daily streaks, badges, and a leaderboard.
- **Adaptive onboarding** — a short diagnostic quiz sets your starting
  difficulty.
- **Guest mode** — try everything with zero commitment; sign up later and your
  progress carries over.
- **Organization admin** — create an org, invite teammates, assign training
  campaigns, and see org-wide accuracy/risk analytics.
- **Single sign-on** — organizations can link their own OIDC identity provider
  (Okta, Entra ID, Google Workspace, Auth0), so employees sign in with their
  existing corporate account. Membership stays invite-only.
- **First-class accessibility** — text scaling, reduced motion, high contrast,
  a dyslexia-friendly font, and larger tap targets.

## Tech stack

| Area          | Choice                                                        |
| ------------- | -------------------------------------------------------------- |
| Framework     | [Next.js 15](https://nextjs.org/) (App Router), React 19, TS  |
| Styling       | Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com/) on Radix |
| Data fetching | TanStack React Query + a generated (orval) API client         |
| Validation    | Zod (generated request/response schemas)                      |
| Database      | [MongoDB](https://www.mongodb.com/) via the official Node driver, with `$jsonSchema` validators as the source of truth |
| Auth          | Custom httpOnly-cookie sessions, scrypt-hashed passwords      |
| Runtime/PM    | [Bun](https://bun.sh/)                                        |
| Containers    | Docker + Docker Compose (app + local Mongo for dev)           |
| Tests         | `bun test`                                                    |

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) `>= 1.3`
- A MongoDB instance — either a connection string to
  [MongoDB Atlas](https://www.mongodb.com/atlas), or Docker (see below) for a
  disposable local instance
- [`mongosh`](https://www.mongodb.com/docs/mongodb-shell/) is only needed if
  you want to run `db:init`/`db:seed` by hand — the app provisions its own
  schema, indexes, and seed data automatically on startup (see below)

**Docker is optional, not required.** Pick one path per teammate:

- **Shared Atlas cluster** (no Docker needed) — get the `MONGODB_URI` from
  whoever provisioned the cluster (share it out-of-band, e.g. a password
  manager or a DM — never commit it) and paste it into your own `.env`.
  Everyone using the same URI shares the same data.
- **Local Docker Mongo** (no shared secret needed) — each teammate runs
  `docker compose up -d --build` and gets their own disposable local
  database (see below). Nobody needs Atlas credentials, but nobody's data is
  shared either — good for isolated feature work, not for looking at the
  same seeded/live data as someone else.

Docker Desktop (or another Docker engine) is only required for the second
path.

### Setup (Atlas or an existing Mongo instance)

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# then edit .env and point MONGODB_URI at your MongoDB instance

# 3. (Only if you want single sign-on) generate a key to encrypt IdP secrets
openssl rand -base64 32   # paste into APP_ENCRYPTION_KEY in .env

# 4. Start the dev server
bun run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). The first
time anything actually queries the database (any API route — not
necessarily the homepage, which can render without touching Mongo), the
Mongo client (`src/db/client.ts`) automatically applies the schema
(collections + `$jsonSchema` validators + indexes, see
`src/db/provision.ts`) and seeds lessons/practice scenarios/sample
leaderboard users if the database is empty, once per process, in the
background without blocking that request — nobody needs to run a setup
script by hand, whether that's a teammate's laptop, CI, Docker, or a Render
deploy. It's idempotent, so it's safe to run against an already-provisioned
cluster every time the server starts. (This used to run from a Next.js
instrumentation hook, but that gets compiled for the Edge runtime too,
which can't resolve mongodb's optional Node-only encryption submodule —
that failure surfaced as a 500 on every route, not just a warning, so the
logic now lives in the client module every route already imports safely.)

`bun run db:init`/`bun run db:seed` still exist as standalone mongosh/CLI
equivalents (handy for debugging or for teammates working from
`phishaware-db/init/` directly outside this app), but the app no longer
depends on either being run manually.

### Setup with Docker (production container parity)

```bash
docker compose up -d --build
```

This builds the app image from the same `Dockerfile` used for deploys and
runs it against whatever `MONGODB_URI` is in your `.env` (the shared Atlas
cluster) — there's no separate local Mongo container anymore, since
everyone on the team reads/writes the same live database. The app's own
startup hook provisions the schema/indexes and seeds it, same as any other
environment. The app is then available at
[http://localhost:3000](http://localhost:3000). This is mainly useful for
testing the production container build locally before deploying; day-to-day
dev doesn't need Docker at all — just `bun run dev`.

## Scripts

| Script              | Description                                                    |
| ------------------- | --------------------------------------------------------------- |
| `bun run dev`       | Start the Next.js dev server                                    |
| `bun run build`     | Production build                                                |
| `bun run start`     | Serve the production build                                      |
| `bun run lint`      | Run ESLint via `next lint`                                      |
| `bun run typecheck` | Type-check the project with `tsc --noEmit`                     |
| `bun test`          | Run the unit test suite                                         |
| `bun run db:init`   | (Optional, manual) apply the MongoDB schema via mongosh — the app does this itself on startup |
| `bun run db:seed`   | (Optional, manual) seed lessons/scenarios/sample users via CLI — the app does this itself on startup |
| `bun run db:migrate-invites` | One-off: convert legacy dead "invited" user rows into real invitations (dry run; pass `-- --apply`) |
| `bun run codegen`   | Regenerate `api-client`/`api-zod` from `api-spec/openapi.yaml`  |

## Project structure

```
src/
├── app/                # Next.js App Router
│   ├── (app)/          # Authenticated app (dashboard, learn, practice, admin, ...)
│   ├── api/            # Route handlers (auth, lessons, practice, profile, org, ...)
│   ├── auth/           # Login / signup / SSO entry point
│   ├── invite/[token]/ # Public invitation accept page
│   ├── onboarding/     # Diagnostic quiz
│   ├── page.tsx        # Public marketing landing page
│   ├── sitemap.ts      # Generated sitemap
│   └── robots.ts       # Generated robots.txt
├── api-spec/           # OpenAPI spec (openapi.yaml) + orval codegen config
├── api-client/         # Generated React Query hooks + fetch client
├── api-zod/            # Generated Zod request/response schemas
├── components/         # UI components (incl. shadcn/ui in components/ui)
├── db/                 # MongoDB client + collection models (users, scenarios,
│                          lessons, attempts, sessions, organizations,
│                          invitations, ssoConnections, ssoStates, ...)
└── server/             # Domain logic (grading, leveling, streaks, sessions, seeds)
    └── sso/            # OIDC: PKCE, discovery/JWKS cache, ID-token claims, and
                           decideSsoProvisioning() — the pure "who gets in" rule

phishaware-db/init/     # $jsonSchema validators + indexes (source of truth for
                           the Mongo schema; also mounted into the local Docker
                           Mongo container's auto-init)

backend/                # Separate FastAPI service for ML model/dataset work
                           (phishing-likelihood scoring, etc.) -- its own
                           deploy, its own dependencies, not part of the
                           Next.js app. See backend/README.md.
```

## Admin / organizations

Signed-up users start without an organization. Creating one (`/admin/create`)
makes you its admin; from there you can invite members, assign training
campaigns, and view org-wide accuracy/risk analytics under `/admin`.

### Invitations

Inviting someone creates a row in `invitations` (a token, a role, a 14-day
expiry) — not a user account. Because the app has no mailer, the admin UI hands
back a **copyable invite link** instead of sending an email; the members list
can re-copy or rotate it, and rotating invalidates the old one.

Opening `/invite/<token>` lets the invitee either set a password or, if the org
has SSO, sign in with their company account. If a PhishAware account already
uses that address, the password form is replaced by a sign-in prompt: only the
account's own owner, authenticated, can attach it to an org — otherwise an
invitation could quietly absorb a stranger's account. Adopting keeps their
existing XP, streak, and practice history.

Seat limits are enforced at invite time (counting pending invitations) and again
at accept time. A limit of `0` means unlimited.

### Single sign-on (OIDC)

Each organization can link its own identity provider — Okta, Microsoft Entra ID,
Google Workspace, Auth0, or any generic OIDC provider — under
**Admin → Organization → Single sign-on**. Employees then sign in with their
existing corporate account instead of a PhishAware password.

Access is **invite-only**: authenticating with the IdP is not enough. The
callback only admits someone who is already a member or holds a pending
invitation, so admins keep full control of membership.

Setting one up:

1. In your IdP, create a web application and paste in the **redirect URI** shown
   on the settings card (`<your-origin>/api/auth/sso/callback`), exactly.
2. Enter the issuer URL, client ID, and client secret. The issuer has to match
   what the provider publishes character for character — Auth0's includes a
   trailing slash, and Entra's multi-tenant `common` issuer (a literal
   `{tenantid}`) is rejected because it can never be validated.
3. Add the email domains allowed to use this connection.
4. Hit **Test connection** — six server-side checks cover discovery, issuer
   match, endpoints, PKCE S256 support, JWKS, and whether the client credentials
   are actually valid. **Test sign-in** does a real round trip without creating
   a session.
5. Enable it.

The flow is authorization code + PKCE (S256), with single-use `state` stored in
Mongo, nonce binding, and full ID-token validation (signature via cached JWKS,
`iss`, `aud`/`azp`, expiry) handled by `openid-client`. Client secrets are
encrypted at rest with AES-256-GCM under `APP_ENCRYPTION_KEY`.

Note on `email_verified`: Microsoft Entra never sends this claim. An **absent**
claim is treated as verified only when the address falls inside a domain the
admin explicitly allowlisted for that connection — the admin having bound that
domain to that tenant's issuer stands in for the missing signal. An explicit
`false` is always rejected.

Without `APP_ENCRYPTION_KEY` the app runs normally and password auth is
unaffected; SSO simply reports itself as unavailable.

### Testing SSO with Auth0

Auth0's free tier is enough to exercise the whole flow. One-time setup:

1. **Applications → Create Application** → name it `PhishAware` → pick
   **Regular Web Applications** → Create. (Skip the "choose a technology" page.)
2. Open its **Settings** tab and set:
   - **Allowed Callback URLs**: `http://localhost:3000/api/auth/sso/callback`
   - **Allowed Logout URLs**: `http://localhost:3000/auth`

   Exactly those — no trailing slash, no query string. Scroll down and
   **Save Changes**.
3. From the same Settings tab, copy **Domain**, **Client ID**, and
   **Client Secret**.
4. **User Management → Users → Create User**: email `alice@acme.test`,
   any password, connection `Username-Password-Authentication`. Then open the
   user and toggle **Email verified** on.
5. Put the values in `.env` — note the issuer is the domain wrapped in
   `https://` **with a trailing slash**, which is what Auth0 puts in the `iss`
   claim. Getting this wrong is the single most common failure, and the
   preflight check exists specifically to catch it:

   ```bash
   SSO_TEST_ISSUER="https://dev-xxxxxxxx.us.auth0.com/"
   SSO_TEST_CLIENT_ID="..."
   SSO_TEST_CLIENT_SECRET="..."
   SSO_TEST_PROVIDER="auth0"
   SSO_TEST_EMPLOYEE="alice@acme.test"
   ```

6. With `bun run dev` running:

   ```bash
   bun run sso:demo
   ```

   That creates a demo org and admin, saves the connection, runs the six
   preflight checks against your real tenant, enables SSO only if they pass,
   issues an invitation for the test user, and prints the sign-in URL. Add
   `-- --reset` to tear the demo org down and start over.

7. Open `/auth`, click **Sign in with your company account**, enter
   `alice@acme.test`, and authenticate. You should land in the app as a member
   of the demo org.

Worth trying afterwards, since these are the paths that matter:

| Try this | Expected |
| --- | --- |
| An `@acme.test` address with no invitation | `not_a_member` |
| An address at any other domain | `domain_not_allowed` |
| Re-opening the completed callback URL | `invalid_state` (single-use) |
| Deleting the `phishaware_sso_state` cookie mid-flow | `invalid_state` |
| Setting the member's `status` to `disabled` in Mongo | `account_disabled` |

**Google Workspace instead:** issuer is `https://accounts.google.com` (no
trailing slash) and `SSO_TEST_PROVIDER="google"`. Google's issuer is shared by
every Google account, so the `hd` (hosted-domain) claim is what scopes it to
your org — which means you need a real Workspace domain, not a personal Gmail.

### Migrating from the old invite behavior

Earlier builds created a `status: "invited"` user row with no password, which
nobody could ever sign in to. Convert any leftovers into real invitations:

```bash
bun run db:migrate-invites            # dry run — prints what it would change
bun run db:migrate-invites -- --apply
```

## Content model

Both **lessons** and **practice scenarios** are stored in the database and
seeded from code (`src/server/lessons.ts`, `src/server/seedScenarios.ts`) on an
empty database. This means content can be edited in the database without a
redeploy, while the seed files remain the source of truth for a fresh setup.

## Testing

Unit tests cover the pure domain logic — attempt grading, XP/leveling, and
streak calculation:

```bash
bun test
```

## Safety

PhishAware is a training tool. Every scenario is simulated. The app never asks
for real passwords, payment details, or account access, and none of the links
or senders shown are real.
