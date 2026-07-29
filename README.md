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
- **First-class accessibility** — text scaling, reduced motion, high contrast,
  a dyslexia-friendly font, and larger tap targets.

## Tech stack

| Area          | Choice                                                        |
| ------------- | ------------------------------------------------------------- |
| Framework     | [Next.js 15](https://nextjs.org/) (App Router), React 19, TS  |
| Styling       | Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com/) on Radix |
| Data fetching | TanStack React Query + a generated (orval) API client         |
| Validation    | Zod (generated request/response schemas)                      |
| Database      | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/)       |
| Auth          | Custom httpOnly-cookie sessions, scrypt-hashed passwords      |
| Runtime/PM    | [Bun](https://bun.sh/)                                        |
| Tests         | `bun test`                                                    |

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) `>= 1.3`
- A PostgreSQL database

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# then edit .env and point DATABASE_URL at your Postgres instance

# 3. Create the schema
bun run db:push

# 4. Seed lessons, practice scenarios, and sample leaderboard users
bun run db:seed

# 5. Start the dev server
bun run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Scripts

| Script              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `bun run dev`       | Start the Next.js dev server                       |
| `bun run build`     | Production build                                    |
| `bun run start`     | Serve the production build                          |
| `bun run lint`      | Run ESLint via `next lint`                          |
| `bun run typecheck` | Type-check the project with `tsc --noEmit`         |
| `bun test`          | Run the unit test suite                            |
| `bun run db:push`   | Push the Drizzle schema to the database            |
| `bun run db:seed`   | Seed lessons, scenarios, and sample users if empty |

## Project structure

```
src/
├── app/                # Next.js App Router
│   ├── (app)/          # Authenticated app (dashboard, learn, practice, ...)
│   ├── api/            # Route handlers (auth, lessons, practice, profile, ...)
│   ├── auth/           # Login / signup
│   ├── onboarding/     # Diagnostic quiz
│   ├── page.tsx        # Public marketing landing page
│   ├── sitemap.ts      # Generated sitemap
│   └── robots.ts       # Generated robots.txt
├── api-client/         # Generated React Query hooks + fetch client
├── api-zod/            # Generated Zod request/response schemas
├── components/         # UI components (incl. shadcn/ui in components/ui)
├── db/                 # Drizzle connection + schema (users, scenarios, lessons, attempts)
└── server/             # Domain logic (grading, leveling, streaks, sessions, seeds)
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
