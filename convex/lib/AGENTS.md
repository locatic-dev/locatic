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
├── discoverability.ts   # Discoverability / search indexing logic
├── explore.ts           # Discovery query helpers
├── github.ts            # GitHub API helpers
├── homeFeed.ts          # Feed generation / aggregation logic
├── notifications.ts     # Notification helpers
├── project_pins.ts      # Project pinning helpers
├── project_previews.ts  # Project preview / metadata helpers
├── pulse.ts             # Activity pulse / metrics helpers
├── snapshots.ts         # Snapshot utilities for denormalized data
├── topics.ts            # Topic/label extraction helpers
├── types.ts             # Shared TypeScript types
├── viewer.ts            # Current user context helpers
├── posts.ts             # Post visibility helpers: `filterVisiblePosts`, `isPublicPostVisible`, `withCurrentProjectPostFields`, `getVisiblePostProject`
└── __tests__/           # Library tests
```

## WHERE TO LOOK

| Task                     | File                  | Notes                                        |
| ------------------------ | --------------------- | -------------------------------------------- |
| Add schema validator     | `validators.ts`       | Import in `schema.ts`                        |
| Add auth helper          | `auth.ts`             | Backend auth logic                           |
| Post visibility check    | `posts.ts`            | Used by comments, explore, and posts queries |
| Add cleanup helper       | `cleanup.ts`          | Data cleanup, migrations                     |
| Add constant             | `constants.ts`        | Shared values                                |
| Add conversation helper  | `conversation.ts`     | DM/thread helpers                            |
| Add discoverability      | `discoverability.ts`  | Search index, visibility logic               |
| Add explore helper       | `explore.ts`          | Search scope / city defaults                 |
| Add GitHub helper        | `github.ts`           | Repo data fetching helpers                   |
| Add feed helper          | `homeFeed.ts`         | Feed aggregation logic                       |
| Add notification helper  | `notifications.ts`    | Notification targets / state                 |
| Add pinning helper       | `project_pins.ts`     | Project pin/unpin helpers                    |
| Add preview helper       | `project_previews.ts` | Project preview/metadata                     |
| Add pulse/metrics helper | `pulse.ts`            | Activity metrics                             |
| Add snapshot helper      | `snapshots.ts`        | Denormalized data utilities                  |
| Add topic helper         | `topics.ts`           | Topic extraction / labels                    |
| Add viewer helper        | `viewer.ts`           | Bootstrap payloads                           |

## CONVENTIONS

- Validators use Convex `v.*` types, exported for use in `schema.ts`
- Snapshot helpers manage denormalized data patterns
- Domain helpers (homeFeed, explore, pulse) encapsulate complex query logic
- Shared helpers here feed feature `state.ts` / `navigation.ts` modules; keep naming aligned with frontend route helpers.
- Project-related helpers (project_pins, project_previews) operate on denormalized project data
- Discoverability helpers drive search index logic shared across explore and home

## ANTI-PATTERNS

- DO NOT define validators inline in schema.ts — add to `validators.ts`
- DO NOT mix frontend utilities — this is backend-only
- DO NOT duplicate search-state normalization in route files when a lib helper exists
