---
name: Wouter catch-all route must use `*`, not `/:rest*`, to match root
description: A wouter v3 Route with path `/:rest*` silently fails to match the bare `/` path, leaving the app blank at root with no console error.
---

In wouter v3, a `<Route path="/:rest*">` intended as a catch-all (e.g. to wrap all app pages in a shared Layout) does not match the literal root path `/`. Navigating to `/` then matches no Switch case, and nothing renders — with zero console errors or warnings, making it look like an app-mount or data-fetching bug instead of a routing bug.

**Why:** `:rest*` is a named param pattern (zero-or-more segments bound to a param), and in this wouter version it doesn't consider the empty-path case a match against the root the way a true wildcard does.

**How to apply:** For a catch-all Route that must also match the bare root, use `path="*"` instead of `path="/:rest*"`. If a blank page with no console errors appears specifically at `/` but nested paths (e.g. `/dashboard`) render fine, suspect this pattern mismatch first before investigating data-fetching or auth-redirect races.
