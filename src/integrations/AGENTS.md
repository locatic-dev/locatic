# INTEGRATIONS — Third-Party Providers

## OVERVIEW

Third-party service integrations: Clerk (auth), Convex (backend), TanStack Query (data fetching).

## STRUCTURE

```
integrations/
├── clerk/            # Clerk authentication
│   ├── provider.tsx  # ClerkProvider wrapper
│   └── ...           # Auth helpers, hooks
├── convex/           # Convex backend connection
│   ├── provider.tsx  # ConvexProvider wrapper
│   └── ...           # Client setup, hooks
└── tanstack-query/   # TanStack Query configuration
    ├── root-provider.tsx  # QueryClient setup, getContext()
    └── devtools.tsx       # DevTools integration
```

## WHERE TO LOOK

| Task                      | Location                           | Notes                               |
| ------------------------- | ---------------------------------- | ----------------------------------- |
| Modify auth provider      | `clerk/provider.tsx`               | Clerk configuration                 |
| Modify backend connection | `convex/provider.tsx`              | Convex client setup                 |
| Modify query client       | `tanstack-query/root-provider.tsx` | QueryClient config, SSR integration |

## CONVENTIONS

- Each integration has a provider component that wraps the app tree
- TanStack Query provider exports `getContext()` for router integration
- SSR auth flows through `createServerFn` in `__root.tsx`

## ANTI-PATTERNS

- DO NOT mix integration logic — each provider handles one service
- DO NOT bypass providers to create ad-hoc client instances
