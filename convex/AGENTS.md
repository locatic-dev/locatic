# CONVEX — Backend (Serverless Functions + Schema)

## OVERVIEW

Convex backend: schema definition, serverless functions (queries/mutations), HTTP endpoints, and shared utilities.

## STRUCTURE

```
convex/
├── schema.ts           # Database schema (defineSchema + defineTable)
├── _generated/         # AUTO-GENERATED types (DO NOT EDIT)
├── lib/                # Shared utilities
│   ├── auth.ts         # Backend auth helpers
│   ├── validators.ts   # Schema validators (used in schema.ts)
│   ├── constants.ts    # App-wide constants
│   ├── explore.ts      # Explore scope / search helpers
│   ├── notifications.ts  # Notification target helpers
│   ├── project_access.ts # Project/comment public interactability gates
│   ├── rate_limits.ts  # Rate limiter via @convex-dev/rate-limiter component
│   ├── snapshots.ts    # Snapshot utilities
│   ├── types.ts        # Shared TypeScript types
│   ├── viewer.ts       # Viewer/bootstrap payload helpers
│   ├── posts.ts        # Post visibility helpers (filterVisiblePosts, getVisiblePostProject)
│   ├── account_deletion.ts  # Account deletion lifecycle helpers
│   ├── post_counts.ts  # Post count backfill/rollout helpers
│   ├── webhook_events.ts   # Webhook idempotency/dedup helpers
│   └── __tests__/      # Library tests
├── convex.config.ts    # App config: defineApp + app.use(rateLimiter)
├── auth.config.ts      # Convex auth configuration (requires CLERK_JWT_ISSUER_DOMAIN)
├── users.ts            # User CRUD, profile management
├── projects.ts         # Project/repo management
├── follows.ts          # Follow relationships
├── comments.ts         # Comment system
├── reactions.ts        # Like/reaction system
├── notifications.ts    # Notification delivery
├── conversations.ts    # Messaging
├── explore.ts          # Discovery queries
├── home.ts             # Feed generation
├── pulse.ts            # Activity pulse/metrics
├── github.ts           # GitHub API integration
├── github_actions.ts   # GitHub Actions sync
├── crons.ts            # Scheduled tasks
├── http.ts             # HTTP endpoints (webhooks)
├── cities.ts           # City data queries
├── citiesSeed.ts       # City data seeding
├── cleanup.ts          # Data cleanup utilities
├── posts.ts            # Project post / status update management
└── reactionConfigSeed.ts # Reaction config seeding
```

## WHERE TO LOOK

| Task                   | File                                       | Notes                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add DB table           | `schema.ts`                                | Use validators from `lib/validators.ts`                                                                                                                                                                                          |
| Add query/mutation     | New file or existing domain file           | `export const myQuery = query({...})`                                                                                                                                                                                            |
| Add HTTP endpoint      | `http.ts`                                  | Webhooks, external API callbacks                                                                                                                                                                                                 |
| Project/comment access | `lib/project_access.ts`                    | `isProjectPubliclyInteractable`, `getPubliclyInteractableProject`, `isCommentPubliclyInteractable`                                                                                                                               |
| Rate limiting          | `lib/rate_limits.ts`                       | `enforceRateLimit` via `@convex-dev/rate-limiter` component; token buckets + fixed windows                                                                                                                                       |
| Post visibility        | `lib/posts.ts`                             | Used by `posts.ts`, `comments.ts`, `explore.ts`                                                                                                                                                                                  |
| Post search text       | `lib/posts.ts`                             | `buildPostSearchText`, `normalizePostSearchQuery`, `isPublicPostVisible` for search indexing                                                                                                                                     |
| Explore result         | `explore.ts`                               | Validators for projectSearch/postSearch/builderSearch/exploreFeed results                                                                                                                                                        |
| Explore post dismiss   | `schema.ts` (explore_post_history)         | `dismissPost` mutation, `resetDismissedPosts`, filtered via `by_user_dismissed` index                                                                                                                                            |
| Add scheduled task     | `crons.ts`                                 | Cron-triggered functions                                                                                                                                                                                                         |
| Add validator          | `lib/validators.ts`                        | Used in schema definitions                                                                                                                                                                                                       |
| GitHub integration     | `github.ts`, `github_actions.ts`           | API sync, webhooks                                                                                                                                                                                                               |
| Account deletion       | `lib/account_deletion.ts`                  | `getAccountDeletionWindow`, `shouldPurgeDeletedAccount`; cleanup schedules `purgeDeletedAccountIfDue` via cron                                                                                                                   |
| Post counts            | `lib/post_counts.ts`                       | `shouldPatchUserPostsCount`, `getNextUserPostsCountBackfillCursor` for rollout                                                                                                                                                   |
| Webhook event dedup    | `lib/webhook_events.ts`, `http.ts`         | Idempotent Clerk webhook handling via `webhook_events` table; `markClerkWebhookEventProcessing` mutation                                                                                                                         |
| Add post management    | `posts.ts`                                 | Project posts and owner-authored project activity                                                                                                                                                                                |
| Add seed data          | `citiesSeed.ts`, `reactionConfigSeed.ts`   | City + reaction seed data                                                                                                                                                                                                        |
| Viewer/bootstrap       | `users.ts`, `lib/viewer.ts`                | Authenticated app payloads; preserve contracts                                                                                                                                                                                   |
| Profile comment build  | `users.ts`                                 | `buildProfileCommentPreview` supports both `targetType: 'project'` and `'post'`; ancestor chain via `parentId` traversal (max 20 hops, cycle-detected); availability via `isProjectPubliclyInteractable`/`getVisiblePostProject` |
| Explore state          | `explore.ts`, `lib/explore.ts`             | Search scope / city defaults; `searchProjects`, `searchPosts`, `searchBuilders`                                                                                                                                                  |
| Notification state     | `notifications.ts`, `lib/notifications.ts` | Read state + backfill helpers                                                                                                                                                                                                    |
| Conversation flow      | `conversations.ts`                         | Two-phase: `findWithUser` query → `sendFirstMessage` mutation; no `startOrGet`                                                                                                                                                   |
| Home feed              | `home.ts`                                  | Paginated via `paginationOptsValidator` + `paginationResultValidator`                                                                                                                                                            |
| Project sync           | `projects.ts`, `github_actions.ts`         | Repo metadata + sync orchestration                                                                                                                                                                                               |

## CONVENTIONS

- File name becomes function namespace: `users.ts` → `api.users.myFunction`
- Validators defined in `lib/validators.ts`, imported in `schema.ts`
- `_generated/` is auto-generated by Convex CLI — NEVER edit
- Use `query()` for reads, `mutation()` for writes, `action()` for external calls
- `auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN` — fails fast if missing
- Convex tsconfig requires `"types": ["node"]` for Node.js type access
- Viewer/bootstrap queries feed route-prefetch flows; keep payload names stable when editing `users.ts` or `lib/viewer.ts`.
- `users.ts` is the largest backend domain file; avoid opportunistic refactors while changing auth/profile/bootstrap behavior.
- Feature search/navigation helpers should stay aligned with Convex query args and payload shapes.
- Rate limiting defined in `lib/rate_limits.ts` via `@convex-dev/rate-limiter`; `convex.config.ts` registers the component via `app.use(rateLimiter)`.
- Project/comment public interactability gates live in `lib/project_access.ts` — use instead of inline owner/visibility checks.
- Conversation flow is two-phase: `findWithUser` query → `sendFirstMessage` mutation. No `startOrGet`.
- Post dismissal uses `explore_post_history` table with `by_user_dismissed` index; mirrors project dismissal pattern.
- Post search returns paginated payload `{posts, hasMore}` instead of flat array; filters out dismissed posts.
- Home feed uses `paginationOptsValidator` + `paginationResultValidator` for proper Convex pagination.
- Account deletion lifecycle: `deletedAt` (first request) → `deactivatedAt` → `purgeAfter` (30d retention) → `purgedAt` (cleanup); cleanup cron schedules `purgeDeletedAccountIfDue` via `by_purge_after` index.
- Webhook event processing: idempotent via `webhook_events` table with `by_source_event` index; `markClerkWebhookEventProcessing` mutation dedups before processing.
- Post create/remove updates `user.stats.postsCount` atomically; post counts backfill via `lib/post_counts.ts`.
- Profile comment build: `buildProfileCommentPreview` walks ancestor chain via `parentId` traversal (max 20 hops, cycle-detected) to populate `ancestorCommentIds` and `rootCommentId`; uses `isProjectPubliclyInteractable`/`getVisiblePostProject` for availability; supports both `project` and `post` target types.

## ANTI-PATTERNS

- NEVER edit `_generated/` directory
- DO NOT define validators inline in schema.ts — use `lib/validators.ts`
- DO NOT mix HTTP endpoints with regular queries/mutations
- DO NOT return ad hoc payload shapes when shared viewer/explore helpers already exist

## NOTES

- Convex functions are automatically typed via `_generated/api.d.ts`
- Search indexes defined on tables (e.g., cities `search_text` index)
- Convex env vars set via `npx convex env set` — `.env.local` does not propagate
