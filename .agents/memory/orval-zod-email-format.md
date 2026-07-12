---
name: Orval + zod v3 email format incompatibility
description: OpenAPI `format: email` breaks Orval-generated Zod schemas when the project's installed zod is v3.
---

If an OpenAPI spec field has `type: string, format: email`, Orval's Zod generator emits `z.string().email()` or `zod.email()` depending on version — in some Orval versions this targets zod v4's static `z.email()` method, which does not exist in zod v3.

**Why:** This causes a hard TypeScript failure (`Property 'email' does not exist`) in generated client/schema packages, breaking `typecheck` across the whole monorepo even though the OpenAPI spec itself is valid.

**How to apply:** Before adding `format: email` (or other newer JSON Schema string formats) to an OpenAPI spec consumed by Orval, check the installed `zod` version in the workspace. If it's v3, avoid `format: email` and rely on `type: string` with `minLength`/`maxLength` instead; do format validation at the route/handler level if needed. Re-run codegen and typecheck after any spec change touching string formats.
