# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

Locatic is a location-aware developer discovery platform — "GitHub with a map." Developers sign in with GitHub via Clerk, select repositories to showcase, set a city, and discover what others are building nearby. The core interaction loop is social and project-first: follow builders, like projects, comment on work, send direct messages.

**Stack:** React 19 + TanStack Start + TanStack Router + TanStack Query + Convex + Clerk + Tailwind CSS v4 + Cloudflare Workers

## Commands

```bash
# Development — run both concurrently in separate terminals
pnpm dlx convex dev          # Start Convex backend (watches convex/ for changes)
pnpm dev                     # Start frontend dev server on http://localhost:3000

# Quality checks
pnpm test                    # Vitest run (all tests)
pnpm lint                    # oxlint
pnpm typecheck               # tsc --noEmit
pnpm format                  # oxfmt + oxlint --fix
pnpm check                   # oxfmt --check + oxlint (CI-mode, no writes)
pnpm ci:quality              # check + typecheck + test

# Run a single test file
pnpm exec vitest run src/features/__tests__/contracts.test.ts

# Build & deploy
pnpm build                   # Production build
pnpm deploy:convex           # Deploy Convex backend
pnpm deploy                  # Build + wrangler deploy (Cloudflare Workers)
```

## Architecture

### Data flow

All data flows through Convex. The frontend never calls external APIs directly — GitHub API calls happen inside Convex `action()` functions. TanStack Query wraps Convex via `@convex-dev/react-query` so queries are reactive and cache-backed.

### Directory layout

```
src/
  routes/           File-based TanStack Router routes
  features/         Domain logic, hooks, types (one dir per domain)
  components/       Shared UI — app-shell/ and ui/ (shadcn/ui)
  integrations/     Clerk, Convex, TanStack Query provider wiring
  lib/              Shared utilities (format, icons, time, utils)

convex/
  schema.ts         Primary Convex data model
  lib/              Backend utilities: auth.ts, validators.ts, constants.ts, snapshots.ts
  _generated/       Auto-generated Convex types — NEVER edit
  crons.ts          All scheduled background jobs
  http.ts           HTTP endpoints (Clerk webhook handler)
```

### Routing

Routes live in `src/routes/`. File name = URL path. Key conventions:

- `__root.tsx` — root layout; Clerk SSR auth via `createServerFn`; `context.auth` available in all route `beforeLoad`
- `_app.tsx` + `_app/` — authenticated layout wrapper; all routes inside `_app/` require login
- `sign-in.$.tsx` / `sign-up.$.tsx` — splat pattern required for Clerk's hosted pages (not flat `sign-in.tsx`)
- Routes stay thin: they call feature hooks, render UI, nothing else

### Features

`src/features/` contains one directory per domain (`cities`, `explore`, `follows`, `github`, `home`, `inbox`, `notifications`, `onboarding`, `profile`, `projects`, `settings`, `viewer`). Features communicate across boundaries only via `src/features/contracts.ts`. Routes import from features; features never import from routes.

### Convex backend

Each file in `convex/` becomes a function namespace: `users.ts` → `api.users.*`. Function types: `query()` for reads, `mutation()` for writes, `action()` for external calls (GitHub API, Clerk Backend API). All validators are defined in `convex/lib/validators.ts` and imported into `schema.ts`.

### Auth boundary

Clerk provides auth. The TanStack Start server reads `CLERK_SECRET_KEY` for SSR. Convex verifies JWTs using `CLERK_JWT_ISSUER_DOMAIN` configured in `convex/auth.config.ts`. These are two separate runtime boundaries — `.env.local` values do not propagate to Convex; set them with `npx convex env set`.

## Styling

Tailwind v4 with no `tailwind.config.js` — config is in `src/styles.css` via `@theme`. Use semantic utility tokens (`bg-surface`, `text-text-muted`, `rounded-card`, `shadow-card`) — never use `var(--lx-*)` directly in components. All UI must be mobile-first and work at 320px. Use `.page-shell` / `.page-shell__content` classes for route-level layout padding and safe-area handling, not custom spacing.

## Key constraints

- **Never edit `convex/_generated/`** — regenerated automatically by `convex dev`
- **TanStack deps are pinned** — do not upgrade `@tanstack/*` packages independently; they must be upgraded together
- `autoCodeSplitting: false` in `vite.config.ts` — manual vendor chunk groups are defined there instead
- Do not add TanStack Router plugin or Query devtools manually — `tanstackStart()` and the current setup handle them
- Features may not import from each other directly — cross-feature types go in `contracts.ts`
- Per-route auth server functions are forbidden — auth is centralized in `__root.tsx`
- Do not add global providers outside `__root.tsx`

## Environment variables

| Variable                       | Runtime               | Purpose                      |
| ------------------------------ | --------------------- | ---------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY`   | Browser               | ClerkProvider                |
| `VITE_CONVEX_URL`              | Browser               | Convex React client          |
| `CLERK_SECRET_KEY`             | TanStack Start server | SSR auth, `getToken()`       |
| `CONVEX_DEPLOYMENT`            | Convex CLI            | Local dev target             |
| `CLERK_JWT_ISSUER_DOMAIN`      | Convex runtime        | JWT verification             |
| `CLERK_SECRET_KEY`             | Convex actions        | GitHub actions backend calls |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Convex HTTP           | `/clerk/webhooks` handler    |

`CLERK_SECRET_KEY` is not a browser variable. Convex runtime vars must be set via `npx convex env set`, not `.env.local`.
