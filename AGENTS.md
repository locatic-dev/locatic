# PROJECT KNOWLEDGE BASE

**Stack:** TanStack Start + Convex + Clerk + Cloudflare Workers + Tailwind v4

## OVERVIEW

Locatic — "GitHub with a map." Developer activity platform: discover projects, track builds, follow developers, like/comment. SSR React app deployed to Cloudflare Workers.

## STRUCTURE

```
./
├── src/                    # Frontend + SSR (TanStack Start)
│   ├── start.ts            # Start request middleware: CSRF + Clerk
│   ├── router.tsx          # Router + SSR query integration
│   ├── routeTree.gen.ts    # Generated TanStack route tree (DO NOT EDIT)
│   ├── routes/             # File-based routing (TanStack Router)
│   ├── features/           # Feature modules (domain logic + hooks)
│   ├── components/         # Shared UI (shadcn/ui + app-shell)
│   ├── integrations/       # 3rd-party providers (Clerk, Convex, TanStack Query)
│   └── lib/                # Shared utilities
├── convex/                 # Backend (Convex serverless functions + schema)
│   ├── lib/                # Shared backend utilities
│   └── _generated/         # Auto-generated Convex types (DO NOT EDIT)
├── docs/                   # PRD, issue tracker, plans, screenshots
│   ├── assets/             # Captured UI artifacts and references
│   └── plans/              # Implementation plans and RCAs
├── scripts/                # Seed data generation, geonames processing
├── public/                 # Static assets
└── .github/workflows/      # CI / deploy workflows
```

## WHERE TO LOOK

| Task                 | Location                                                                      | Notes                                                                                       |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Add route            | `src/routes/`                                                                 | File-based routing, `_app/` = auth-required                                                 |
| Add feature          | `src/features/`                                                               | Domain logic, hooks, types per feature                                                      |
| Add UI component     | `src/components/ui/`                                                          | shadcn/ui components                                                                        |
| Add route pending UI | `src/components/app-shell/route-pending.tsx`                                  | Shared suspense fallback for auth routes                                                    |
| Add Convex function  | `convex/`                                                                     | Queries, mutations, HTTP endpoints                                                          |
| Add DB table         | `convex/schema.ts`                                                            | Define table + validators in `convex/lib/validators.ts`                                     |
| Add product doc      | `docs/`                                                                       | PRDs, design notes, issue trackers, plans                                                   |
| Add plan / RCA       | `docs/plans/`                                                                 | Implementation plans, remediation notes                                                     |
| Auth logic           | `src/routes/__root.tsx` + `src/lib/auth-routing.ts` + `convex/auth.config.ts` | SSR auth centralized in root, route-target helpers, Convex JWT issuer config                |
| Request middleware   | `src/start.ts`                                                                | CSRF filtered to server functions, Clerk middleware                                         |
| Router setup         | `src/router.tsx` + `src/routeTree.gen.ts`                                     | Router factory + generated route tree                                                       |
| API integrations     | `convex/github.ts`                                                            | GitHub API sync, webhooks                                                                   |
| App shell/layout     | `src/components/app-shell/`                                                   | Sidebar, header, navigation                                                                 |
| Vite config          | `vite.config.ts`                                                              | Code splitting groups, plugins                                                              |
| Post visibility      | `convex/lib/posts.ts`                                                         | Shared helpers: `filterVisiblePosts`, `isPublicPostVisible`, `withCurrentProjectPostFields` |
| Project posts feed   | `src/features/projects/posts/`                                                | `ProjectPostsSection` — paginated post list for project detail                              |
| Builder search       | `src/integrations/convex/query-options.ts`                                    | `builderSearchQueryOptions` takes `{cityIds, limit, q}` object                              |

## CONVENTIONS

- Path aliases: `#/*` and `@/*` → `./src/*`
- Formatting: oxfmt (semi: false, singleQuote: true, trailingComma: all, printWidth: 80)
- Linting: oxlint with type-aware checks (`--typeAware`)
- Testing: Vitest + Testing Library (`__tests__/` dirs colocated)
- Convex validators: defined in `convex/lib/validators.ts`, used in schema
- Feature modules: each feature in `src/features/<name>/` has its own domain logic
- Route guards: `_app/` prefix = authenticated routes
- TanStack deps pinned to compatible versions (see package.json) — do not upgrade independently
- Semantic Tailwind tokens preferred over inline styles or direct CSS var usage
- Nested AGENTS.md files under `src/` and `convex/` override root guidance for their subtree.
- Route loading is suspense-first now: shared pending UI lives in `src/components/app-shell/route-pending.tsx`.
- Auth route targeting now flows through `src/lib/auth-routing.ts`; keep route names aligned with `_app` and sign-in/out redirects.

## ANTI-PATTERNS (THIS PROJECT)

- NEVER edit `convex/_generated/` — auto-generated by Convex CLI
- DO NOT mix feature logic in `src/routes/` — routes delegate to `src/features/`
- DO NOT bypass Convex for data — all data flows through Convex queries
- NEVER commit `.env.local` — use `.env.example` as template
- DO NOT add global CSS — use Tailwind classes or `src/styles.css` for CSS variables
- DO NOT create per-route auth server functions — auth is centralized in `__root.tsx` via `createServerFn`
- DO NOT add TanStack Router plugin or devtools wiring manually — `tanstackStart` handles router in vite.config.ts
- DO NOT use fixed px spacing — use shared layout tokens from `src/styles.css` such as `--lx-gutter` and `--lx-section-gap`
- DO NOT bypass mobile-first breakpoints — all new UI must work at 320px viewport
- DO NOT use direct `var(--lx-*)` in components — use semantic Tailwind utilities (`bg-surface`, `text-text-muted`, `rounded-card`, `shadow-card`, etc.) unless the value is genuinely runtime-only
- DO NOT use inline `style={{}}` for layout — prefer Tailwind utility classes
- DO NOT write product docs outside `docs/`.

## UNIQUE STYLES

- Convex + TanStack Query integration via `@convex-dev/react-query`
- Clerk auth wired through SSR (`createServerFn` in `__root.tsx`) — `context.auth` available in all route `beforeLoad`
- CSRF protection via `createCsrfMiddleware` in `src/start.ts`, filtered to server functions only
- Vite code splitting: vendor-react, vendor-tanstack, vendor-clerk, vendor-convex, vendor-ui
- City-based developer discovery (custom `cities` table with search index)
- `autoCodeSplitting: false` — manual chunk groups in vite.config.ts
- Mobile-first responsive layout: shared layout tokens, safe-area padding, and CSS custom properties in `src/styles.css`
- Touch-friendly targets (min 44px), content wrapping, mobile tab bar for navigation
- Semantic Tailwind tokens: `--color-*`, `--radius-*`, `--shadow-*` registered via `@theme` in `styles.css` — use utility classes like `bg-surface`, `text-text-muted`, `rounded-card`, `shadow-card` instead of direct `var(--lx-*)`
- Auth routes use splat pattern: `sign-in.$.tsx`, `sign-up.$.tsx` (not flat `sign-in.tsx`)
- `routeTree.gen.ts` is generated by TanStack Router and contains type suppressions from the generator; never hand-edit it.
- Docs live in `docs/`: PRD, database design, UI issue tracker, implementation plans, screenshots.

## ENV / RUNTIME BOUNDARIES

| Variable                       | Runtime               | Purpose                                       |
| ------------------------------ | --------------------- | --------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY`   | Browser               | ClerkProvider client key                      |
| `VITE_CONVEX_URL`              | Browser               | Convex React client URL                       |
| `CLERK_SECRET_KEY`             | TanStack Start server | `auth()` and `getToken()` in server functions |
| `CONVEX_DEPLOYMENT`            | Convex CLI            | Local `npx convex dev` target                 |
| `CLERK_JWT_ISSUER_DOMAIN`      | Convex runtime        | `convex/auth.config.ts` JWT verification      |
| `CLERK_SECRET_KEY` (Convex)    | Convex actions        | Backend API calls (e.g., `github_actions.ts`) |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Convex HTTP           | `/clerk/webhooks` handler                     |

Convex env vars must be set via `npx convex env set` — `.env.local` values do not propagate to Convex runtime.

## COMMANDS

```bash
pnpm dev              # Dev server (port 3000)
pnpm build            # Production build
pnpm preview          # Preview production build
pnpm test             # Vitest run
pnpm lint             # oxlint
pnpm typecheck        # tsc --noEmit
pnpm format           # oxfmt + oxlint --fix
pnpm check            # oxfmt --check + oxlint
pnpm ci:quality       # check + typecheck + test
pnpm ci:build                     # build only
pnpm build:development            # Development-mode Vite build
pnpm build:production             # Production-mode Vite build
pnpm deploy:convex                # Deploy Convex backend
pnpm deploy:convex:development    # Deploy Convex (dev)
pnpm deploy:convex:production     # Deploy Convex (prod)
pnpm deploy:worker:development    # Build + wrangler deploy (dev)
pnpm deploy:worker:production     # Build + wrangler deploy (prod)
pnpm deploy                       # Build + wrangler deploy (prod)
pnpm cities:generate  # Regenerate city seed data
pnpm reactions:generate # Regenerate reaction seed data
```

## NOTES

- Node.js 24.x required by `package.json`; pnpm@11.1.2 via `packageManager`
- Convex functions: `convex/<file>.ts` — filename becomes function namespace
- Route file naming: `_app` = layout route, `$param` = dynamic segment, `__root` = root
- TanStack Start owns the app entry; there are no hand-written client/server entry files.
- Tailwind v4 uses `@tailwindcss/vite` plugin — no `tailwind.config.js` needed
- Wrangler config in `wrangler.jsonc` — secrets via `wrangler secret put`
- `CLERK_SECRET_KEY` is NOT a browser variable — used only by TanStack Start server runtime and Convex backend actions
- Convex tsconfig requires `"types": ["node"]` for Node.js type access in server code
- Feature state/search helpers live beside the feature they normalize (`state.ts`, `navigation.ts`, `helpers.ts`); routes stay thin.

## RESPONSIVE LAYOUT

- `src/styles.css` defines shared layout tokens such as `--lx-gutter`, `--lx-section-gap`, `--lx-feed-max`, `--lx-form-max`, `--lx-detail-max`, and `--lx-public-max`
- Page-shell helpers: `.page-shell`, `.page-shell__content` for consistent route layouts
- Mobile-first breakpoints: Tailwind `sm:` (640px), `md:` (768px), `lg:` (1024px)
- App shell: sidebar collapses on mobile, mobile tab bar appears at bottom, header actions wrap
- All routes use `.page-shell` for consistent padding, max-width, and safe-area handling
- Skip link in `__root.tsx` for keyboard accessibility
