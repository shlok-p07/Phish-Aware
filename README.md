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
- [`mongosh`](https://www.mongodb.com/docs/mongodb-shell/) for `db:init`

### Setup (Atlas or an existing Mongo instance)

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# then edit .env and point MONGODB_URI at your MongoDB instance

# 3. Apply the schema (collections + $jsonSchema validators + indexes)
bun run db:init

# 4. Seed lessons, practice scenarios, and sample leaderboard users
bun run db:seed

# 5. Start the dev server
bun run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

`./dev.sh` wraps steps 3-5 into one command (verifies Mongo connectivity
first) and `./dev.sh stop` stops the dev server it started.

### Setup with Docker (local Mongo, no Atlas needed)

```bash
docker compose up -d --build
```

This builds the app image and starts a local `mongo:7` container, which
auto-applies the schema (collections + validators + indexes) on first boot.
Then seed it once from the host (Mongo's port is published to
`localhost:27017`):

```bash
MONGODB_URI="mongodb://localhost:27017" bun run db:seed
```

The app is then available at [http://localhost:3000](http://localhost:3000).
This is for local dev/test parity only — it's a disposable database, separate
from whatever `MONGODB_URI` your `.env` points at for non-Docker development.

## Scripts

| Script              | Description                                                    |
| ------------------- | --------------------------------------------------------------- |
| `bun run dev`       | Start the Next.js dev server                                    |
| `bun run build`     | Production build                                                |
| `bun run start`     | Serve the production build                                      |
| `bun run lint`      | Run ESLint via `next lint`                                      |
| `bun run typecheck` | Type-check the project with `tsc --noEmit`                     |
| `bun test`          | Run the unit test suite                                         |
| `bun run db:init`   | Apply the MongoDB schema (validators + indexes)                |
| `bun run db:seed`   | Seed lessons, scenarios, and sample users if empty              |
| `bun run codegen`   | Regenerate `api-client`/`api-zod` from `api-spec/openapi.yaml`  |

## Project structure

```
src/
├── app/                # Next.js App Router
│   ├── (app)/          # Authenticated app (dashboard, learn, practice, admin, ...)
│   ├── api/            # Route handlers (auth, lessons, practice, profile, org, ...)
│   ├── auth/           # Login / signup
│   ├── onboarding/     # Diagnostic quiz
│   ├── page.tsx        # Public marketing landing page
│   ├── sitemap.ts      # Generated sitemap
│   └── robots.ts       # Generated robots.txt
├── api-spec/           # OpenAPI spec (openapi.yaml) + orval codegen config
├── api-client/         # Generated React Query hooks + fetch client
├── api-zod/            # Generated Zod request/response schemas
├── components/         # UI components (incl. shadcn/ui in components/ui)
├── db/                 # MongoDB client + collection models (users, scenarios,
│                          lessons, attempts, sessions, organizations, ...)
└── server/             # Domain logic (grading, leveling, streaks, sessions, seeds)

phishaware-db/init/     # $jsonSchema validators + indexes (source of truth for
                           the Mongo schema; also mounted into the local Docker
                           Mongo container's auto-init)
```

## Admin / organizations

Signed-up users start without an organization. Creating one (`/admin/create`)
makes you its admin; from there you can invite members, assign training
campaigns, and view org-wide accuracy/risk analytics under `/admin`. Invited
members' accounts are created immediately with status "invited" — there's no
invite-email/accept flow yet, since this app has no mailer.

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
