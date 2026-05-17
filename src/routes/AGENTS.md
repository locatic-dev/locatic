# ROUTES — TanStack Router (File-Based)

## OVERVIEW

File-based routing via TanStack Router. `_app/` prefix = authenticated layout route.

## STRUCTURE

```
routes/
├── __root.tsx          # Root route — Clerk SSR auth, provider tree, head config
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
├── sign-in.tsx         # Clerk sign-in
└── u.$username.tsx     # Public user profile
```

## WHERE TO LOOK

| Task                    | File                     | Notes                             |
| ----------------------- | ------------------------ | --------------------------------- |
| Add public route        | `routes/<name>.tsx`      | Direct file = public route        |
| Add protected route     | `routes/_app/<name>.tsx` | Inside `_app/` = requires auth    |
| Add dynamic param route | `routes/$param.tsx`      | `$` prefix = dynamic segment      |
| Modify root layout      | `__root.tsx`             | Providers, SSR auth, meta tags    |
| Modify auth layout      | `_app.tsx`               | Sidebar, header, navigation shell |

## CONVENTIONS

- Route file names map directly to URL paths
- `_app` prefix = layout route that wraps children in auth guard
- `$param` = dynamic URL segment (e.g., `$username` → `/u/:username`)
- Routes delegate to `src/features/` for domain logic — keep routes thin
- `__root.tsx` handles Clerk SSR auth via `createServerFn` — `context.auth` available in all route `beforeLoad`
- Auth is centralized in root — do NOT create per-route auth server functions
- `_app.tsx` reuses `context.auth` from root for auth checks

## ANTI-PATTERNS

- DO NOT put business logic in route files — delegate to features
- DO NOT bypass the `_app/` layout for protected routes
- DO NOT add global providers outside `__root.tsx`
- DO NOT create per-route auth server functions — use centralized `context.auth` from root
