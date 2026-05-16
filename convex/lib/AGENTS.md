# CONVEX/LIB — Backend Shared Utilities

## OVERVIEW

Shared backend utilities for Convex functions: validators, auth helpers, constants, and domain-specific helpers.

## STRUCTURE

```
convex/lib/
├── validators.ts     # Schema validators (v.* definitions)
├── auth.ts           # Backend auth helpers
├── constants.ts      # App-wide constants
├── types.ts          # Shared TypeScript types
├── snapshots.ts      # Snapshot utilities for denormalized data
├── viewer.ts         # Current user context helpers
├── homeFeed.ts       # Feed generation logic
├── explore.ts        # Discovery query helpers
├── notifications.ts  # Notification helpers
├── conversation.ts   # Conversation helpers
├── pulse.ts          # Activity pulse/metrics helpers
└── __tests__/        # Library tests
```

## WHERE TO LOOK

| Task                 | File            | Notes                       |
| -------------------- | --------------- | --------------------------- |
| Add schema validator | `validators.ts` | Import in `schema.ts`       |
| Add auth helper      | `auth.ts`       | Backend auth logic          |
| Add constant         | `constants.ts`  | Shared values               |
| Add snapshot helper  | `snapshots.ts`  | Denormalized data utilities |

## CONVENTIONS

- Validators use Convex `v.*` types, exported for use in `schema.ts`
- Snapshot helpers manage denormalized data patterns
- Domain helpers (homeFeed, explore, pulse) encapsulate complex query logic

## ANTI-PATTERNS

- DO NOT define validators inline in schema.ts — add to `validators.ts`
- DO NOT mix frontend utilities — this is backend-only
