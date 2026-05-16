# LIB — Shared Utilities (Frontend)

## OVERVIEW

Shared utility functions used across the frontend codebase.

## STRUCTURE

```
lib/
├── utils.ts          # cn() className merger, common helpers
├── format.ts         # Date, number, string formatting
├── icons.ts          # Icon mappings, custom icon components
├── route-auth.ts     # Route-level auth helpers
├── social-links.ts   # Social link validation, formatting
├── time.ts           # Time utilities, relative time formatting
└── __tests__/        # Utility tests
```

## WHERE TO LOOK

| Task            | File        | Notes                     |
| --------------- | ----------- | ------------------------- |
| Add utility     | `utils.ts`  | General-purpose helpers   |
| Add formatter   | `format.ts` | Display formatting        |
| Add icon        | `icons.ts`  | Icon components, mappings |
| Add time helper | `time.ts`   | Date/time utilities       |

## CONVENTIONS

- Utilities are pure functions — no side effects
- `cn()` uses `clsx` + `tailwind-merge` for className composition
- Each utility file has a focused domain

## ANTI-PATTERNS

- DO NOT add React components to lib — use `components/`
- DO NOT add business logic — use `features/`
