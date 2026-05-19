# LIB — Shared Utilities (Frontend)

## OVERVIEW

Shared utility functions used across the frontend codebase.

## STRUCTURE

```
lib/
├── utils.ts          # cn() className merger, common helpers
├── format.ts         # Date, number, string formatting
├── icons.ts          # Icon mappings, custom icon components
├── social-links.ts   # Social link validation, formatting
├── time.ts           # Time utilities, relative time formatting
├── auth-routing.ts   # Auth redirect and route-target helpers
└── __tests__/        # Utility tests
```

## WHERE TO LOOK

| Task                  | File              | Notes                     |
| --------------------- | ----------------- | ------------------------- |
| Add utility           | `utils.ts`        | General-purpose helpers   |
| Add formatter         | `format.ts`       | Display formatting        |
| Add icon              | `icons.ts`        | Icon components, mappings |
| Add time helper       | `time.ts`         | Date/time utilities       |
| Add auth route helper | `auth-routing.ts` | Login redirect targets    |

## CONVENTIONS

- Utilities are pure functions — no side effects
- `cn()` uses `clsx` + `tailwind-merge` for className composition
- Each utility file has a focused domain
- Auth moved to `__root.tsx` — no route-level auth helpers in lib
- Auth-routing helpers are shared across route guards and tests; keep route target names in sync with `_app` flows.

## ANTI-PATTERNS

- DO NOT add React components to lib — use `components/`
- DO NOT add business logic — use `features/`
- DO NOT add route auth helpers — centralized in `__root.tsx`
