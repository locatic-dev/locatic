# Playwright (`playwright/`)

End-to-end specs run against the Convex deployment and Clerk instance configured in `.env.local`; see `playwright.config.ts` for projects.

- Name specs `*.public.spec.ts` (signed-out, `chromium-public`) or `*.authenticated.spec.ts` (stored Clerk session from `auth.setup.ts`, `chromium-authenticated`).
- Never print or commit env values or `playwright/.clerk/` storage state.

## Fixtures

- Personas (signed-out visitor, populated user, empty-city user) and the data each one needs are defined in `fixtures/fixtures.md`. Build journeys on those personas; do not add new ad hoc data assumptions.
- The e2e suite cannot reach the in-memory `convex-test` fixtures (`convex/__tests__/fixtures.helpers.ts`). Backend behaviour belongs in `convex-test` contracts; e2e checks journeys and rendering.
- Prefer role, name and state assertions over class strings. When a spec depends on persona data, state the requirement in `fixtures/fixtures.md` rather than silently calling `test.skip`.
