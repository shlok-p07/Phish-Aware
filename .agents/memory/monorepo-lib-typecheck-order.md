---
name: Rebuild lib typechecks before dependent packages after schema/type changes
description: In this pnpm monorepo, editing a shared lib's source (e.g. lib/db schema) doesn't retroactively update its compiled dist type declarations that other packages import against.
---

Packages like `lib/db` ship compiled `dist` type declarations that dependent packages (e.g. `artifacts/api-server`) reference via TypeScript project references. Editing the lib's source (e.g. adding a Drizzle table/column) does not automatically refresh those `dist` declarations.

**Why:** Running `pnpm run typecheck` scoped to a dependent package right after a lib schema change can fail or show stale/missing-property errors that have nothing to do with the actual new code — it's typechecking against the old compiled output.

**How to apply:** After changing a shared lib's schema or exported types, run `pnpm -w run typecheck:libs` (or the equivalent workspace-root typecheck that rebuilds lib declarations) before typechecking or building dependent packages.
