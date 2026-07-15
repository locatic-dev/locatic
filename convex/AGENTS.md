# Convex backend (`convex/`)

Server functions, schema, scheduled work, and external integration endpoints.

- Start schema changes in `schema.ts`; keep `lib/validators.ts`, indexes, and function argument/return validators aligned with the stored shape.
- Public functions are client contracts. Use `internal*` functions for jobs, webhooks, and implementation details; never expose privileged work just for convenience.
- Authenticate and authorize every data access. Reuse helpers in `lib/` for privacy, project access, rate limiting, identity, and webhook idempotency.
- Query through appropriate indexes rather than broad `.collect()` calls on request paths. Preserve pagination and existing response shapes.
- Do not edit `convex/_generated/`; let Convex regenerate it. Keep secrets in environment configuration, never source.
- Add or update focused tests under `convex/lib/__tests__/` for extracted server logic.
