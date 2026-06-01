# RCA: Production `Viewer not found` Convex Errors

Date: 2026-06-01
Production deployment: `first-rooster-975`

## Summary

Authenticated Locatic routes intermittently surfaced `ConvexError: Viewer not found`
from queries such as `home:list`, `users:viewerLikedProjectIds`,
`notifications:unreadCount`, `explore:list`, and private profile queries.

The primary failure mode was not missing profile data. Production Convex logs
showed most failures running with `identityType:"unknown"` and zero database
reads, which means Convex did not receive a valid user token for that browser
subscription. A smaller set ran with `identityType:"user"` but still had zero
database reads, which is consistent with an auth state transition where the
subscription is known as user-scoped before `ctx.auth.getUserIdentity()` is ready
for the function invocation.

Root cause: private browser subscriptions were allowed to mount before
`ConvexProviderWithClerk` finished attaching a Clerk token to the Convex client.
Private route loaders could also prefetch auth-required Convex queries during
browser navigation before the component auth boundary rendered.
The backend helper also collapsed token-not-ready and real missing-viewer-row
states into the same `Viewer not found` error, which made the production logs
harder to interpret.

## Evidence

The user-provided incident around 2026-06-01 15:02:59 IST showed:

- `home:list` failed at `convex/home.ts:17`.
- `users:viewerLikedProjectIds` failed at `convex/users.ts:804`.
- `users:viewerBootstrap` succeeded immediately before and after the failures.
- The same private queries succeeded or were served from cache moments later.

Production CLI sampling used:

```bash
pnpm exec convex logs --prod --history 500 --jsonl
```

The bounded sample found:

- 32 `Viewer not found` failures.
- 24 failures with `identityType:"unknown"`.
- 8 failures with `identityType:"user"`.
- Affected identifiers:
  - `home:list`
  - `users:viewerLikedProjectIds`
  - `notifications:unreadCount`
  - `explore:list`
  - `explore:listNearbyBuilders`
  - `projects:listMine`
  - `users:privateProfileOverview`
  - `users:privateProfileProjects`
  - `users:privateProfileComments`
  - `users:privateProfileContributions`
  - `users:privateProfileLikedProjects`
  - `users:privateFollowGraphPage`
  - `users:viewerExplorePrefs`

Representative failure fields:

- `requestId: 3369847f766465ee`
- `identifier: users:viewerLikedProjectIds`
- `identityType: unknown`
- `databaseReadDocuments: 0`
- `databaseReadBytes: 0`

The zero database reads matter: `getViewerOrThrow` first calls
`ctx.auth.getUserIdentity()`, and only queries `users.by_clerk_id` after an
identity exists. Zero reads prove the common path failed before viewer lookup.

## Why `viewerBootstrap` Succeeded

`viewerBootstrap` is intentionally tolerant:

- no identity -> `{ isAuthenticated: false, needsOnboarding: false }`
- identity but no viewer row -> `{ isAuthenticated: true, needsOnboarding: true }`
- viewer row -> full viewer payload

Private queries are intentionally strict and call `getViewerOrThrow`. During a
client-side auth transition, `viewerBootstrap` can succeed after the token is
attached while private subscriptions that mounted slightly earlier fail with no
identity. This explains the observed pattern where errors appear briefly and then
the same functions succeed or become cached.

## Root Cause

1. `ConvexProviderWithClerk` gets a token from Clerk asynchronously.
2. Authenticated routes mount `useSuspenseQuery` and `useQuery` for private
   Convex functions.
3. Authenticated child route loaders can prefetch private Convex queries during
   browser navigation before route components render.
4. The Convex browser `SyncWorker` can start those subscriptions before the
   Convex auth state is fully ready.
5. `getViewerOrThrow` calls `getViewerFromAuth`.
6. `getViewerFromAuth` returns `null` for both no identity and no viewer row.
7. `getViewerOrThrow` throws `Viewer not found` for both cases.

The result was production error noise and a misleading error label. Most
incidents were token-readiness problems, not missing `users` documents.

## Fix

Implemented changes:

- Split auth helper states in `convex/lib/auth.ts`.
  - `requireIdentity` throws `Unauthorized` only when no identity exists.
  - `getViewerOrThrow` now throws `Unauthorized` for missing identity and
    `Viewer not found` only after identity exists but the `users` row does not.
  - Added `getViewerAuthState` for non-throwing bootstrap-style flows.
- Kept `viewerBootstrap` read-only, but made it use the explicit auth state.
- Added a runtime return validator for the public `viewerBootstrap` contract.
- Added an authenticated layout boundary that waits for Convex auth readiness
  before rendering `_app` children and their private subscriptions.
- Skipped private Convex query prefetches from `_app` child route loaders during
  browser navigation. SSR prefetch remains enabled because root `beforeLoad`
  has already created a server-authenticated Convex HTTP client.
- Enabled `notifications:unreadCount` only when a viewer exists in bootstrap
  state.
- Added focused unit and component tests for the new auth states, route-loader
  prefetch guard, and boundary.

## Prevention

- Treat Convex auth readiness as a client-side precondition for private
  subscriptions.
- Keep private route-loader Convex prefetch SSR-only unless the browser has an
  explicit auth-readiness signal available before the loader runs.
- Keep bootstrap/readiness queries tolerant and private domain queries strict.
- Preserve distinct error names:
  - `Unauthorized`: no valid auth identity reached the function.
  - `Viewer not found`: authenticated identity exists but no matching user row
    exists.
- Use production log checks after auth changes:

```bash
pnpm exec convex logs --prod --history 200 --jsonl
```

Filter for `Viewer not found` and verify the remaining cases are true
missing-viewer-row incidents, not token-readiness noise.

## References

- Convex CLI logs: https://docs.convex.dev/cli
- Convex dashboard logs: https://docs.convex.dev/dashboard/deployments/logs
- Convex Clerk auth: https://docs.convex.dev/auth/clerk
- Convex auth in functions: https://docs.convex.dev/auth/functions-auth
- Convex `Auth.getUserIdentity`: https://docs.convex.dev/api/interfaces/server.Auth
- Convex React Clerk provider: https://docs.convex.dev/api/modules/react_clerk
- TanStack Start route guards: https://tanstack.com/start/latest/docs/framework/react/guide/authentication
