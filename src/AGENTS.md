# SRC — Frontend + SSR Runtime

## OVERVIEW

TanStack Start app code: routes, feature modules, shared UI, providers, utilities, generated router artifacts, and global theme tokens.

## STRUCTURE

```
src/
├── start.ts          # Start middleware: CSRF + Clerk
├── router.tsx        # Router factory + SSR query integration
├── routeTree.gen.ts  # Generated TanStack route tree (DO NOT EDIT)
├── routes/           # File-based routing; child AGENTS apply
├── features/         # Domain logic/hooks/types; child AGENTS apply
├── components/       # Shared UI and shell; child AGENTS apply
├── integrations/     # Clerk, Convex, TanStack Query providers
├── lib/              # Pure shared frontend helpers
└── styles.css        # Tailwind v4 theme, layout tokens, page-shell helpers
```

## WHERE TO LOOK

| Task                       | Location                 | Notes                                                   |
| -------------------------- | ------------------------ | ------------------------------------------------------- |
| Add/modify route           | `routes/`                | Thin route files; loaders prefetch shared query options |
| Add domain behavior        | `features/<domain>/`     | Hooks/state/navigation/helpers live with domain         |
| Add shared UI              | `components/`            | Use existing shell/UI guidance before editing           |
| Add provider/client wiring | `integrations/`          | One service per provider boundary                       |
| Add utility                | `lib/`                   | Pure helpers only; no components or feature logic       |
| Adjust global styling      | `styles.css`             | Theme tokens and page-shell utilities only              |
| Router/runtime changes     | `router.tsx`, `start.ts` | Keep generated route tree untouched                     |

## CONVENTIONS

- Imports use `@/*` or `#/*` aliases to `src/*`; keep aliases aligned with `package.json`, `tsconfig.json`, and `vite.config.ts`.
- TanStack Router route files are source; `routeTree.gen.ts` is generated and may contain generator-owned suppressions.
- `router.tsx` wires `@tanstack/react-router-ssr-query`; loader prefetches should use shared query option helpers.
- `start.ts` keeps request middleware small: CSRF applies only to server functions, then Clerk middleware runs.
- `styles.css` owns dark-first Locatic tokens, `@theme` registrations, safe-area layout variables, and `.page-shell` helpers.
- Runtime-only style values may be inline; static layout belongs in semantic Tailwind utilities.

## ANTI-PATTERNS

- DO NOT edit `routeTree.gen.ts`.
- DO NOT add global providers outside `routes/__root.tsx` unless the router context contract changes too.
- DO NOT duplicate query option builders in routes; use `integrations/convex/query-options.ts` or feature wrappers.
- DO NOT put business logic in `routes/`, `components/`, or `lib/` when a feature module owns it.
- DO NOT add direct `var(--lx-*)` usage in components when semantic Tailwind utilities exist.
