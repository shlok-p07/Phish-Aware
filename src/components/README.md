# src/components

React components shared by the pages in [`src/app`](../app). Files are kebab-case and use
named exports only.

## Layout of the folder

| Path | What lives there |
| --- | --- |
| `ui/` | shadcn/ui primitives on Radix: `alert-dialog`, `badge`, `button`, `card`, `dialog`, `empty`, `form`, `input`, `label`, `progress`, `radio-group`, `select`, `sheet`, `skeleton`, `slider`, `switch`, `table`, `tabs`, `toast`, `toaster`, `tooltip`. |
| `practice/` | The practice simulators and the pure helpers they use. |
| `learn/` | `lesson-screen.tsx`, which renders one lesson screen. |
| top level | App components: the signed-in shell, shared states, dashboard cards, auth and onboarding pieces, and the landing-page demos. |

`ui/` is vendored: `eslint.config.mjs` ignores it ("Vendored via the shadcn CLI"). The
primitives use project classes from `src/app/globals.css`, such as `hover-elevate`. There is
no `components.json` in the repo. Build app components from these primitives.

## Practice and learn components

The email inbox and the SMS thread are not components. They are rendered inside
[`src/app/(app)/practice/page.tsx`](<../app/(app)/practice/page.tsx>) by `inboxList()`,
`messagesList()`, `callLogList()` and `smsThread()`. The other vectors use the components below.

| File | Export | What it does |
| --- | --- | --- |
| `practice/voice-call.tsx` | `VoiceCall` | Simulated phone call. Speaks the transcript with speech synthesis and reveals it line by line. Its fixed slate/emerald/red palette is deliberate: it depicts a phone UI, so it ignores the app theme. |
| `practice/qr-notice.tsx` | `QrNotice` | A printed notice with a QR code. The code is a decorative pattern and is deliberately not scannable. The destination shows on hover or focus. |
| `practice/social-dm.tsx` | `SocialDm` | A direct message on a professional network. The profile card opens on demand. The link is never a real anchor. |
| `practice/web-page.tsx` | `WebPage`, `splitUrl` | A sign-in page inside browser chrome, with the registrable domain emphasised in the URL. Every field is disabled and there is no submit path. |
| `practice/use-attempt-flow.ts` | `useAttemptFlow` | State for one round: `inspect` → `cues` → `confidence` → `feedback`. |
| `practice/cue-highlight.ts` | `CUE_REGION`, `findBodyMatch`, `highlightClass` | Maps each cue to the part of the message it points at. |
| `practice/sender.ts`, `transcript.ts`, `caller-voice.ts`, `decoys.ts` | helpers | Sender parsing, transcript parsing, caller voice casting, and the filler rows around a scenario. |
| `learn/lesson-screen.tsx` | `LessonScreenView` | Renders one lesson screen by its `kind` (type `LessonScreen` from `@/db/models/lessons`). |

## App components

| File | Export | Used by |
| --- | --- | --- |
| `layout.tsx` | `Layout` | `(app)/layout.tsx`. Sidebar and mobile nav. Redirects to `/auth` or `/onboarding`. Mounts `ChatbotProvider`, `GuestBanner` and `OrgAccent`. |
| `page-shell.tsx` | `PageShell`, `PageHeader` | Every `(app)` page. `PageShell` is the one place a page's width is set. |
| `states.tsx` | `ErrorState`, `EmptyState`, skeletons | Loading, empty and error states. Pass a query's `refetch` to `ErrorState`'s `onRetry`. |
| `chatbot-widget.tsx` | `ChatbotProvider`, `useChatbot`, `ChatMessageList`, `ChatComposer` | The assistant. Practice and lesson pages reuse the same thread inline. |
| `org-brand.tsx` | `OrgAccent`, `OrgLogo` | The organisation's accent colour and logo (see below). |
| `notification-banner.tsx`, `retention-card.tsx`, `onboarding-survey.tsx`, `forgot-password-dialog.tsx`, `password-strength.tsx` | | The dashboard, `/onboarding`, `/auth` and the invite page. |
| `report-phish-note.tsx` | `ReportPhishNote`, `reportHref` | Practice feedback, phishing scenarios only. |
| `inbox-preview.tsx`, `sms-preview.tsx`, `voice-preview.tsx`, `vector-preview-toggle.tsx`, `domain-reveal.tsx`, `comparison-table.tsx`, `spotlight-card.tsx`, `reveal.tsx` | | The landing page, `src/app/page.tsx`. `VectorPreviewToggle` reuses `QrNotice`, `SocialDm` and `WebPage` with sample content. |

## Data fetching

Components that need server data call the orval-generated React Query hooks, imported from
the `@/api-client` barrel (see [`../api-spec/README.md`](../api-spec/README.md)). Six files
here do: `layout.tsx`, `chatbot-widget.tsx`, `notification-banner.tsx`,
`forgot-password-dialog.tsx`, `guest-banner.tsx` (a query key only) and
`practice/use-attempt-flow.ts` (a type only). The rest take data as props from the page that
owns the query. Nothing here calls `fetch()` directly.

The `QueryClient` in `src/app/providers.tsx` sets `staleTime: 30_000` and turns off
`refetchOnWindowFocus`. After a mutation, invalidate the affected query with its generated
key, as `notification-banner.tsx` does with `getListMyNotificationsQueryKey()`.

## Theming and accessibility

Dark mode comes from next-themes (`attribute="class"`, default `system`) in
`src/app/providers.tsx`. Colours are HSL tokens on `:root` and `.dark` in `src/app/globals.css`, exposed to Tailwind
through `@theme inline`. Use the semantic classes (`bg-primary`, `text-muted-foreground`,
`bg-destructive`, `bg-warning`, `bg-success`) rather than palette literals such as
`bg-amber-500`. High contrast and org branding only override tokens, so palette literals
ignore them (the comment in `password-strength.tsx` records this).

`AccessibilityProvider` (`src/hooks/use-accessibility.tsx`) stores each setting in
`localStorage` under an `a11y_*` key, falls back to the matching media query where there is
one, and toggles a class on `<html>`. `globals.css` does the rest:

| Setting | Class on `<html>` | Effect |
| --- | --- | --- |
| Text size | `text-scale-lg`, `text-scale-xl` | Root font size 112.5% or 125%. Sizes in `rem` scale; fixed `px` sizes do not. |
| Reduce motion | `reduce-motion` | Animation and transition durations drop to 0.001ms. Defaults to `prefers-reduced-motion`. |
| High contrast | `high-contrast` | Stronger `--border`, `--input`, `--muted-foreground`, `--ring`, and a 3px focus outline. Defaults to `prefers-contrast: more`. |
| Dyslexia font | `dyslexia-font` | Swaps the sans and display fonts for Atkinson Hyperlegible. |
| Large targets | `large-targets` | 44px minimum height on buttons, links, labels, checkboxes and radios. Defaults on for `pointer: coarse`. |

CSS handles declarative motion. JavaScript-driven motion must check `useReducedMotion()`
from [`use-reduced-motion.ts`](use-reduced-motion.ts), which is true under the OS setting or the app toggle.

`OrgAccent` writes a `<style>` element that overrides `--primary`, `--primary-foreground` and
`--ring` for light, dark and both high-contrast modes. It re-checks the hex value against
`/^#[0-9a-f]{6}$/i` and moves only its lightness until it reaches 4.5:1 against the card
surface (7:1 in high contrast). The foreground is computed as black or white. `OrgLogo` only
renders `https://` URLs and falls back to an icon if the image fails to load.

## Adding a component

1. Put it at the top level, or in `practice/` or `learn/` if it belongs to that feature.
2. Add `"use client"` if it uses state, effects or browser APIs, as nearly every file here does.
3. Compose from `ui/` primitives and merge classes with `cn()` from `@/lib/utils`.
4. Use theme tokens for colour. Use `PageShell` and `states.tsx` rather than hand-rolled
   widths and loading cards.
5. Keep pure logic in its own `.ts` file so it can be tested without rendering, as
   `practice/sender.ts` does.
6. In practice simulators, nothing may reach a real channel: no real anchors, no working
   forms, no scannable codes.
7. Re-validate any admin-supplied value before it reaches CSS or an `href`, as `org-brand.tsx`
   and `report-phish-note.tsx` do.

## Tests

Tests sit next to the file they cover. The runner is chosen by file extension (see
`vitest.config.ts`):

| Pattern | Runner | Command | Used for |
| --- | --- | --- | --- |
| `*.vitest.tsx`, `*.vitest.ts` | Vitest, happy-dom | `bun run test:ui` | Rendering tests. 17 files, all in this folder. |
| `*.test.ts` | `bun test` | `bun run test` | Pure logic, for example `practice/sender.test.ts`. |
| `*.test.tsx` | `bun test` with happy-dom | `bun run test` | Rendering tests that need `@/test/mock-api-client`. Here, only `chatbot-widget.test.tsx`. |

`@/test/mock-api-client` is built on Bun's `mock.module()`, which Vitest cannot call from a
helper module, so tests that mock `@/api-client` stay on `bun test`. `bunfig.toml` preloads
happy-dom for them. `bun run test:coverage` covers `src/components`, excluding `ui/`. See
[`../test/README.md`](../test/README.md) for the shared mocks.
