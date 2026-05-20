# CONVEX/LIB — Backend Shared Utilities

## OVERVIEW

Shared backend utilities for Convex functions: validators, auth helpers, constants, and domain-specific helpers.

## STRUCTURE

```
convex/lib/
├── validators.ts      # Schema validators (v.* definitions)
├── auth.ts            # Backend auth helpers
├── constants.ts       # App-wide constants
├── explore.ts         # Discovery query helpers
├── notifications.ts   # Notification helpers
├── snapshots.ts       # Snapshot utilities for denormalized data
├── types.ts           # Shared TypeScript types
├── viewer.ts          # Current user context helpers
└── __tests__/        # Library tests
```

## WHERE TO LOOK

| Task                    | File               | Notes                        |
| ----------------------- | ------------------ | ---------------------------- |
| Add schema validator    | `validators.ts`    | Import in `schema.ts`        |
| Add auth helper         | `auth.ts`          | Backend auth logic           |
| Add constant            | `constants.ts`     | Shared values                |
| Add snapshot helper     | `snapshots.ts`     | Denormalized data utilities  |
| Add explore helper      | `explore.ts`       | Search scope / city defaults |
| Add notification helper | `notifications.ts` | Notification targets / state |
| Add viewer helper       | `viewer.ts`        | Bootstrap payloads           |

## CONVENTIONS

- Validators use Convex `v.*` types, exported for use in `schema.ts`
- Snapshot helpers manage denormalized data patterns
- Domain helpers (homeFeed, explore, pulse) encapsulate complex query logic
- Shared helpers here feed feature `state.ts` / `navigation.ts` modules; keep naming aligned with frontend route helpers.

## ANTI-PATTERNS

- DO NOT define validators inline in schema.ts — add to `validators.ts`
- DO NOT mix frontend utilities — this is backend-only
- DO NOT duplicate search-state normalization in route files when a lib helper exists
