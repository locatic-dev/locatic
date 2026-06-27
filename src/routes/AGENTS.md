# ROUTES — TanStack Router (File-Based)

## OVERVIEW

File-based routing via TanStack Router. `_app/` prefix = authenticated layout route.

## STRUCTURE

```
routes/
├── __root.tsx          # Root route — Clerk SSR auth, provider tree, head config
├── __tests__/          # Route-level tests (root error page, etc.)
├── _app.tsx            # Authenticated layout wrapper
├── _app/               # Protected routes (require login)
│   ├── home.tsx        # Main feed
│   ├── explore.tsx     # Discover developers/projects
│   ├── inbox.tsx       # Messages/conversations
│   ├── notifications.tsx
│   ├── profile.tsx
│   ├── project.$owner.$repo.tsx  # Dynamic project detail
│   └── settings.tsx    # User settings
├── index.tsx           # Landing page (public)
├── onboarding.tsx      # New user onboarding flow
├── sign-in.$.tsx       # Clerk sign-in (splat route)
├── sign-up.$.tsx       # Clerk sign-up (splat route)
└── u.$username.tsx     # Public user profile (projects, contributions, liked projects, profile tabs)
```

## WHERE TO LOOK

| Task                    | File                                        | Notes                             |
| ----------------------- | ------------------------------------------- | --------------------------------- |
| Add public route        | `routes/<name>.tsx`                         | Direct file = public route        |
| Add protected route     | `routes/_app/<name>.tsx`                    | Inside `_app/` = requires auth    |
| Add dynamic param route | `routes/$param.tsx`                         | `$` prefix = dynamic segment      |
| Modify root layout      | `__root.tsx`                                | Providers, SSR auth, meta tags    |
| Modify auth layout      | `_app.tsx`                                  | Sidebar, header, navigation shell |
| Modify route loading UX | `../components/app-shell/route-pending.tsx` | Shared pending fallback           |
| Router generation       | `../routeTree.gen.ts`                       | Generated; do not edit manually   |

## CONVENTIONS

- Route file names map directly to URL paths
- `_app` prefix = layout route that wraps children in auth guard
- `$param` = dynamic URL segment (e.g., `$username` → `/u/:username`)
- Routes delegate to `src/features/` for domain logic — keep routes thin
- `__root.tsx` handles Clerk SSR auth via `createServerFn` — `context.auth` available in all route `beforeLoad`
- Auth is centralized in root — do NOT create per-route auth server functions
- `_app.tsx` reuses `context.auth` from root for auth checks; authenticates shell paints immediately from SSR viewer bootstrap (`ensureQueryData` in `beforeLoad`), only `<Outlet/>` content waits on Convex auth handshake via `ContentRoutePending`.
- Unread counts gated on Convex auth handshake (`useConvexAuth`) — never fire before Convex readiness when shell paints ahead.
- App routes now use loader-prefetched suspense queries with route-pending fallbacks instead of ad-hoc loading states.
- `routeTree.gen.ts` is generated from this directory; fix source route files, not the generated tree.
- All routes use `.page-shell` class for responsive spacing and safe-area handling
- Public routes (index, sign-in.$, sign-up.$, u.$username, onboarding): full-width mobile, centered desktop
- `__root.tsx` includes skip link for keyboard accessibility
- Routes use Tailwind-first styling — semantic tokens (`bg-surface`, `text-text-muted`) over inline styles or `var(--lx-*)`
- Route search params should come from feature helpers (`state.ts`, `navigation.ts`, `helpers.ts`) instead of ad hoc parsing inside route files.
- `u.$username.tsx` supports contributions tab via `contributionsVisibility` privacy gating; uses `getVisibleProfileContentTabs` + `isProfileContributionsPublic` from `src/features/profile/state.ts` for tab filtering and gating.
- Shared Convex query options live in `src/integrations/convex/query-options.ts`; use them for loader prefetches.

## ANTI-PATTERNS

- DO NOT put business logic in route files — delegate to features
- DO NOT bypass the `_app/` layout for protected routes
- DO NOT add global providers outside `__root.tsx`
- DO NOT create per-route auth server functions — use centralized `context.auth` from root
- DO NOT use fixed px spacing in routes — use `.page-shell` plus shared layout tokens like `--lx-gutter`
- DO NOT create route-specific scroll handling — content scrolls within page-shell
- DO NOT use inline `style={{}}` for layout — use Tailwind utility classes
- DO NOT use direct `var(--lx-*)` — use semantic Tailwind tokens (`bg-surface`, `text-text-muted`, etc.) unless the value is runtime-only
- DO NOT normalize search params or destination maps inside routes when feature helpers exist
- DO NOT edit `src/routeTree.gen.ts`; route source files regenerate it
