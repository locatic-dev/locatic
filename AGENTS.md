# Locatic

Developer activity platform ("GitHub with a map"). TypeScript SSR app using TanStack Start, Convex, Clerk, Cloudflare Workers, and Tailwind v4. Use the nearest `AGENTS.md`; nested guidance adds to this file.

## Commands

```sh
pnpm dev                 # local app at :3000
pnpm test                # Vitest
pnpm check               # format, lint, and contrast checks
pnpm typecheck           # TypeScript without emitting files
pnpm ci:quality          # check + typecheck + tests
pnpm ci:build            # production build + bundle budget
pnpm e2e                 # Playwright (starts a local server)
```

Run the narrowest relevant check while iterating; run `pnpm ci:quality` for cross-cutting changes. Use `pnpm format` only when formatting the files in scope; it applies fixes across the repository.

## Work boundaries

- Read the closest `AGENTS.md`, the changed code, and its nearby tests before editing.
- Keep changes inside the requested feature. Preserve unrelated working-tree changes and never reset, overwrite, or reformat them.
- Do not edit generated output: `src/routeTree.gen.ts` or `convex/_generated/`.
- Do not commit secrets, change deployment configuration, or run deployment commands unless explicitly asked.
- Use `@/` imports for `src/`; keep type imports type-only. Follow the existing code style instead of introducing a new pattern.

## Where to start

| Need                               | Start here                    |
| ---------------------------------- | ----------------------------- |
| Page, URL, auth gate, SSR loader   | `src/routes/`                 |
| Client domain behavior             | `src/features/`               |
| Reusable UI or application chrome  | `src/components/`             |
| Providers and shared query options | `src/integrations/`           |
| Frontend utility                   | `src/lib/`                    |
| Data model or server function      | `convex/`                     |
| Product/design decision            | `docs/` (verify against code) |

## Project conventions

- Routes compose feature and UI modules; feature modules own domain state, mutations, and view helpers.
- Reuse shared UI, query options, utility helpers, semantic Tailwind tokens, and tests before adding a parallel abstraction.
- Use semantic Tailwind tokens instead of static inline styles; reserve inline styles for genuinely dynamic runtime values.
- Keep accessibility intact: semantic controls, visible focus, labels for inputs, and keyboard operation for interactive UI.
- Treat schema, auth, privacy, and webhook changes as contract changes: update validation and focused tests together.
- Playwright separates `*.public.spec.ts` from `*.authenticated.spec.ts`; keep unit tests colocated with the code they cover.
