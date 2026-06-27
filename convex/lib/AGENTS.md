# CONVEX/LIB — Backend Shared Utilities

## OVERVIEW

Shared backend utilities for Convex functions: validators, auth helpers, constants, and domain-specific helpers.

## STRUCTURE

```
convex/lib/
├── validators.ts        # Schema validators (v.* definitions)
├── auth.ts              # Backend auth helpers
├── cleanup.ts           # Data cleanup / migration utilities
├── constants.ts         # App-wide constants
├── conversation.ts      # Conversation helpers
├── discoverability.ts   # Discoverability / search indexing (mergeBuilderSearchCandidates)
├── explore.ts           # Discovery query helpers
├── github.ts            # GitHub API helpers
├── homeFeed.ts          # Feed generation / aggregation logic
├── notifications.ts     # Notification helpers (buildProjectNotificationTarget, etc.)
├── project_access.ts    # Public interactability gates for projects/comments
├── privacy.ts           # Contribution privacy: `isContributionsVisibleOnPublicProfile`, `ContributionsPrivacy`
├── project_contributor_sync.ts  # Contributor sync: runProjectContributorSyncTargets, recomputeContributionCountsForUsers
├── project_pins.ts      # Project pinning helpers
├── project_route.ts     # Project route key normalization & owner login resolution
├── project_previews.ts  # Project preview / metadata helpers
├── pulse.ts             # Activity pulse / metrics helpers
├── rate_limits.ts       # Rate limiter config + enforceRateLimit via @convex-dev/rate-limiter
├── snapshots.ts         # Snapshot utilities for denormalized data
├── topics.ts            # Topic/label extraction helpers
├── types.ts             # Shared TypeScript types
├── viewer.ts            # Current user context helpers
├── posts.ts             # Post helpers: `filterVisiblePosts`, `isPublicPostVisible`, `withCurrentProjectPostFields`, `getVisiblePostProject`, `buildPostSearchText`, `normalizePostSearchQuery`
├── account_deletion.ts  # Account deletion lifecycle: `getAccountDeletionWindow`, `shouldPurgeDeletedAccount`
├── post_counts.ts       # Post count backfill: `shouldPatchUserPostsCount`, `getNextUserPostsCountBackfillCursor`
├── reactions.ts         # Reaction helpers: `getCommentReactionCounts`, `getViewerReactionTypesByTargetId`
├── webhook_events.ts    # Webhook idempotency: `compactWebhookError`, `getWebhookProcessingDecision`
├── clerk.ts             # Clerk GitHub external account parsing: `parseClerkGithubExternalAccount`, `resolveStoredGithubId`
├── github_identity.ts   # GitHub username uniqueness: `assertGithubUsernameAvailable`
├── user_github_id_backfill.ts  # Batch backfill github.id: `runUserGithubIdBackfillTargets`, validators/types
└── __tests__/           # Library tests (includes reactions.test.ts, clerk.test.ts, github_identity.test.ts)
```

## WHERE TO LOOK

| Task                     | File                          | Notes                                                                                                                                                                                       |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add schema validator     | `validators.ts`               | Includes `homeFeedTargetValidator`, `profileTargetSnapshotValidator`, `homeFeedRowKindValidator`, `homeFeedGroupKindValidator` — import in `schema.ts`                                      |
| Add auth helper          | `auth.ts`                     | Backend auth logic                                                                                                                                                                          |
| Post visibility/search   | `posts.ts`                    | `buildPostSearchText`, `normalizePostSearchQuery` for search index                                                                                                                          |
| Add cleanup helper       | `cleanup.ts`                  | Data cleanup, migrations                                                                                                                                                                    |
| Add constant             | `constants.ts`                | Enum arrays: event/notification types, feed reasons, `HOME_FEED_ROW_KIND_VALUES`, `HOME_FEED_GROUP_KIND_VALUES`, `HOME_FEED_EXPANDED_PREVIEW_LIMIT`                                         |
| Add conversation helper  | `conversation.ts`             | DM/thread helpers                                                                                                                                                                           |
| Add discoverability      | `discoverability.ts`          | Search index, visibility logic                                                                                                                                                              |
| Add explore helper       | `explore.ts`                  | Search scope / city defaults                                                                                                                                                                |
| Add GitHub helper        | `github.ts`                   | Repo data fetching helpers; `mapGithubContributorsForImport`, `isProjectContributorSyncDue` for contributor sync cadence; includes `GithubUserIdentity`, `mapGithubUserIdentityForBackfill` |
| Add Clerk GitHub parsing | `clerk.ts`                    | `parseClerkGithubExternalAccount` parses GitHub ids from Clerk external accounts; `resolveStoredGithubId` preserves existing on re-auth                                                     |
| Add GitHub identity      | `github_identity.ts`          | `assertGithubUsernameAvailable` — throws if another active user has the same GitHub username                                                                                                |
| Add GitHub id backfill   | `user_github_id_backfill.ts`  | `runUserGithubIdBackfillTargets` batch backfills `github.id` from GitHub API; validators and types for backfill targets/results/summaries                                                   |
| Add contributor sync     | `project_contributor_sync.ts` | `runProjectContributorSyncTargets` for batched sync with failure summary; `recomputeContributionCountsForUsers`                                                                             |
| Add feed helper          | `homeFeed.ts`                 | Feed aggregation logic; `upsertHomeFeedItemForEvent` exported for backfill usage                                                                                                            |
| Add notification helper  | `notifications.ts`            | Notification targets / state                                                                                                                                                                |
| Add project access gate  | `project_access.ts`           | `isProjectPubliclyInteractable`, `getPubliclyInteractableProject`, `isCommentPubliclyInteractable`                                                                                          |
| Add privacy helper       | `privacy.ts`                  | `ContributionsPrivacy` type + `isContributionsVisibleOnPublicProfile` for public profile contribution gating                                                                                |
| Add rate limiting        | `rate_limits.ts`              | `enforceRateLimit` via `@convex-dev/rate-limiter` component                                                                                                                                 |
| Add pinning helper       | `project_pins.ts`             | Project pin/unpin helpers                                                                                                                                                                   |
| Add preview helper       | `project_previews.ts`         | Project preview/metadata                                                                                                                                                                    |
| Add route helper         | `project_route.ts`            | Route-safe key normalization, owner login resolution                                                                                                                                        |
| Add pulse/metrics helper | `pulse.ts`                    | Activity metrics                                                                                                                                                                            |
| Add snapshot helper      | `snapshots.ts`                | Denormalized data utilities                                                                                                                                                                 |
| Add topic helper         | `topics.ts`                   | Topic extraction / labels                                                                                                                                                                   |
| Add account deletion     | `account_deletion.ts`         | `getAccountDeletionWindow`, `shouldPurgeDeletedAccount`; 30d retention window                                                                                                               |
| Add post count helper    | `post_counts.ts`              | `shouldPatchUserPostsCount`, backfill cursor helpers                                                                                                                                        |
| Add webhook event helper | `webhook_events.ts`           | `compactWebhookError`, `getWebhookProcessingDecision` for idempotent processing                                                                                                             |
| Add reaction helper      | `reactions.ts`                | `getCommentReactionCounts` (legacy `likesCount` fallback), `getViewerReactionTypesByTargetId` (batch query with target ID dedup)                                                            |
| Add viewer helper        | `viewer.ts`                   | Bootstrap payloads                                                                                                                                                                          |

## CONVENTIONS

- Validators use Convex `v.*` types, exported for use in `schema.ts`
- Snapshot helpers manage denormalized data patterns
- Domain helpers (homeFeed, explore, pulse) encapsulate complex query logic
- Shared helpers here feed feature `state.ts` / `navigation.ts` modules; keep naming aligned with frontend route helpers.
- Project-related helpers (project_pins, project_previews, project_access) operate on project data
- Rate limiter config and enforcement lives in `rate_limits.ts`; component registered in parent `convex.config.ts`
- Discoverability helpers drive search index logic shared across explore and home

## ANTI-PATTERNS

- DO NOT define validators inline in schema.ts — add to `validators.ts`
- DO NOT mix frontend utilities — this is backend-only
- DO NOT duplicate search-state normalization in route files when a lib helper exists
