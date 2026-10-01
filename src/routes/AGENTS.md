# Routes (`src/routes/`)

File-based TanStack Router routes. Read the sibling route and its feature module before extending a flow.

- `_app/` contains authenticated routes; public routes stay at this level (`_app/project.$owner.$repo.tsx` is the one exception: it renders for visitors). Keep auth/redirect decisions centralized in `__root.tsx`, `src/lib/auth-routing.ts` and `src/lib/safe-redirect.ts` (the destination contract: `redirect` search param, safe relative URLs only).
- Define and normalize route params/search at the route boundary; place reusable search-state logic in the owning feature's `state.ts`.
- Compose pages from `features/` and `components/`; do not move domain mutations or reusable state into route files.
- Prefer existing SSR query-option helpers in `src/integrations/convex/query-options.ts` and preserve the route's loading/error behavior.
- Add or update focused route/feature tests when changing navigation, search, or authorization behavior. Never edit `src/routeTree.gen.ts`.
