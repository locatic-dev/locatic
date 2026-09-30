# Locatic

Locatic is a location-aware developer discovery product built around a simple idea: **GitHub with a map.**

Developers sign in with GitHub, choose which repositories to showcase, set their city, and discover what other people are building nearby or across the world. The core interaction loop is social and project-first: follow builders, like projects, comment on work, and start direct conversations.

## What Exists Today

- Public landing page with a map of cities that have builders and up to three real public projects (labelled examples while there is too little data)
- GitHub sign-in with Clerk; a sign-in started from a page returns to it (validated same-site `redirect`)
- Short onboarding: city (or "can't find my city"), then optional build status, name and bio, repository import, and an optional list of builders in your city to follow; it ends on the preserved destination, else Explore
- Home: activity from people you follow, last 30 days
- Explore, public to signed-out visitors: projects, builders and posts, everywhere or by city, with primary-language, topic and "open to collab" filters in the URL
- City pages (`/c/{city}`): counts, recent work, builders, recent posts and nearby cities on a map
- Project pages with reactions, comments, posts, releases and a private Save
- Public profiles with pinned projects, recent work, a shipping log, the contribution graph and languages
- Saved, Inbox (incoming requests, pending outgoing conversations), Notifications and Settings (three accent themes)
- Server-side location privacy: exact city, region only or hidden, applied to every public response, count and map point

Pulse, the ranked trending chart from the original PRD, is retired: city pages carry local discovery, with no numbered ranks. The `pulse_snapshots` table and its rows are kept; nothing writes them any more.

## Product Model

Locatic organizes discovery into distinct surfaces:

- **Home** is the personal feed: activity from people you follow, nothing injected.
- **Explore** is discovery by city or everywhere, ordered by most recent public work (and, for members, projects matching their stack first).
- **City pages** show one place: its builders, their work and nearby active cities.
- **Project detail** is the main conversion surface for reactions, comments, saves, follows and repository context.
- **Profile** presents a builder's identity, pinned and recent work, comment history, and liked work depending on privacy settings.
- **Inbox** supports direct builder-to-builder messaging; first messages from strangers arrive as requests.
- **Settings** controls account data, privacy, notifications, theme and connected accounts.

Product principles are in [docs/PRODUCT.md](docs/PRODUCT.md), the design system in [docs/DESIGN.md](docs/DESIGN.md), and discovery, Home and privacy rules in [docs/explore-home-logic.md](docs/explore-home-logic.md). Data model details are in [docs/Locatic_Database_Design.md](docs/Locatic_Database_Design.md).

## Tech Stack

- React 19
- TanStack Start
- TanStack Router
- TanStack Query
- Convex
- Clerk
- Tailwind CSS v4
- Cloudflare Workers via Wrangler
- Vitest for tests

## Local Development

### Prerequisites

- Node.js `24.x`
- `pnpm@11.1.2` via the `packageManager` field
- A Clerk application with GitHub OAuth enabled
- A Convex project

### Install

```bash
corepack enable
pnpm install
```

### Environment Variables

Create `.env.local` from `.env.example` and set:

```bash
# Browser / client bundle
VITE_CLERK_PUBLISHABLE_KEY=
VITE_CONVEX_URL=

# TanStack Start server
CLERK_SECRET_KEY=

# Playwright E2E
E2E_CLERK_USER_EMAIL=

# Convex CLI / local tooling
CONVEX_DEPLOYMENT=

# Convex deployment / runtime
CLERK_JWT_ISSUER_DOMAIN=
```

Browser / client bundle:

- `VITE_CLERK_PUBLISHABLE_KEY` for the Clerk client provider
- `VITE_CONVEX_URL` for the Convex React client

TanStack Start server:

- `CLERK_SECRET_KEY` for `auth()` and `getToken()` in server functions and SSR route auth

Playwright E2E:

- `E2E_CLERK_USER_EMAIL` for a dedicated Clerk development/test user. Playwright uses `@clerk/testing` to create a Clerk session and stores the browser state in `playwright/.clerk/user.json`, which is gitignored. For richer authenticated UI coverage, complete onboarding for this user once in the development Clerk/Convex environment.

Convex CLI / local tooling:

- `CONVEX_DEPLOYMENT` for local Convex tooling

Convex deployment / runtime:

- `CLERK_JWT_ISSUER_DOMAIN` for `convex/auth.config.ts`
- `CLERK_SECRET_KEY` if Convex actions call Clerk's Backend API
  - This app needs it for `convex/github_actions.ts`
- `CLERK_WEBHOOK_SIGNING_SECRET` if you use the `/clerk/webhooks` handler

Important: `CLERK_SECRET_KEY` is not a browser variable. It is used by the TanStack Start server runtime and, separately, by Convex only where backend actions explicitly call Clerk server APIs.

### Convex Env Setup

Setting values in `.env.local` is not enough for Convex-managed runtime config. Configure Convex deployment variables separately:

```bash
# Local dev deployment
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-clerk-domain
npx convex env set CLERK_SECRET_KEY sk_test_...

# Production deployment
npx convex env set --prod CLERK_JWT_ISSUER_DOMAIN https://your-clerk-domain
npx convex env set --prod CLERK_SECRET_KEY sk_live_...
```

If you enable Clerk webhooks, also configure:

```bash
npx convex env set CLERK_WEBHOOK_SIGNING_SECRET whsec_...
npx convex env set --prod CLERK_WEBHOOK_SIGNING_SECRET whsec_...
```

The Clerk webhook handler lives at `/clerk/webhooks` in Convex HTTP actions and verifies every request signature. If you enable webhook syncing locally or in production, set `CLERK_WEBHOOK_SIGNING_SECRET` in the matching Convex deployment; `.env.local` does not reach the Convex runtime.

### Run the App

Start Convex in one terminal:

```bash
pnpm dlx convex dev
```

Start the frontend in another:

```bash
pnpm dev
```

The Vite app runs on `http://localhost:3000`.

### Authenticated E2E

Authenticated browser tests use Clerk's Playwright helpers and Playwright `storageState`, so local agents and test runs can open logged-in UI without using your personal browser profile.

Prerequisites:

- `.env.local` has `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CONVEX_URL`, `CLERK_SECRET_KEY`, `E2E_CLERK_USER_EMAIL`, `E2E_PUBLIC_PROFILE_USERNAME`, `E2E_CLERK_EMPTY_CITY_USER_EMAIL`, and `E2E_CLERK_ONBOARDING_USER_EMAIL`
- the populated, empty-city, and unfinished-onboarding Clerk test users exist in the development Clerk instance
- the Convex dev deployment is running this revision and is configured with `CLERK_JWT_ISSUER_DOMAIN`
- the deployment has the documented persona data; see [`playwright/fixtures/fixtures.md`](playwright/fixtures/fixtures.md) for the authoritative variables, setup, and strict-versus-smoke behavior

Run the auth setup only:

```bash
pnpm run e2e:auth
```

Run authenticated E2E tests:

```bash
pnpm run e2e
```

If Chromium is not installed yet, run:

```bash
pnpm exec playwright install chromium
```

### Clerk and GitHub Setup Notes

Locatic assumes users authenticate through Clerk with GitHub connected. The codebase uses Clerk's GitHub OAuth token to:

- list a user's public repositories during onboarding
- import selected repositories into Locatic
- refresh imported repository metadata, README content, releases, and contributor data

In practice, that means your Clerk setup needs GitHub OAuth configured with the permissions required for those flows.

### Seed Data and Background Jobs

The Convex backend schedules these jobs ([convex/crons.ts](convex/crons.ts)):

- seed default cities (daily)
- seed default reactions (daily)
- refresh active GitHub project metadata (hourly, 25 projects per run)
- refresh project contributors (every six hours, 20 projects per run)
- clean up Home feed items, notifications and activity events (daily)

Default city seed data lives in [convex/citiesSeed.ts](convex/citiesSeed.ts). Idle background cost and the daily product counters are described in [docs/metrics.md](docs/metrics.md).

#### One-off migrations

Some changes need a one-time internal migration per deployment after the Convex functions are deployed. Each run processes one page and schedules the next, so one command is enough; add `--prod` for production:

```bash
npx convex run users:backfillOwnerState '{}'          # owner snapshots and privacy-derived fields
npx convex run cities:recountStats '{}'               # city counters and nearby-city cells
npx convex run users:backfillLastPublicActivity '{}'  # builder activity ranking signal
npx convex run notifications:backfillTargets '{}'     # stored notification destinations
```

#### Project reaction-count backfill

Deploy the Convex functions before starting this one-time compatibility
backfill. Run `pnpm project-reactions:backfill:development` against the
development deployment first, then use
`pnpm project-reactions:backfill:production` only after reviewing the
development result. The first batch schedules the remaining bounded batches;
monitor Convex function logs until `scheduledContinuation` is `false` and
review the reported `likeMismatches` total. Re-running the command is safe:
projects that already have reaction counts are skipped, and existing public
like totals are preserved.

## Available Scripts

```bash
pnpm dev                    # local app at http://localhost:3000
pnpm build                  # production build
pnpm preview                # preview the build
pnpm test                   # Vitest (unit and convex-test)
pnpm e2e                    # Playwright (starts a local server)
pnpm e2e:auth               # Playwright Clerk auth setup only
pnpm e2e:headed             # Playwright, headed
pnpm e2e:ui                 # Playwright UI mode
pnpm lint                   # oxlint
pnpm typecheck              # TypeScript, no emit
pnpm format                 # oxfmt + oxlint --fix across the repository
pnpm check                  # format check, lint and the guardrails below
pnpm ci:quality             # check + typecheck + test
pnpm ci:build               # build + bundle budget
pnpm contrast:check         # WCAG contrast matrix for the tokens in all themes
pnpm check:arbitrary        # arbitrary font sizes, radii, shadows, colours in features and routes
pnpm check:collect          # .collect() calls outside internal migrations
pnpm design:tokens          # regenerate docs/DESIGN.md front matter from src/styles.css
pnpm design:tokens:check    # fail when docs/DESIGN.md front matter drifts
pnpm bundle:check           # gzip budgets for the client entry and motion chunks
pnpm deploy:convex          # deploy Convex functions
pnpm deploy                 # build and deploy the production Worker
```

## Project Structure

```text
src/
  routes/        TanStack file-based routes (_app/ holds member routes)
  features/      Domain UI, state, queries and mutations per feature
  components/    app-shell/ (navigation, layout) and ui/ (primitives)
  integrations/  Clerk, Convex and TanStack Query wiring, shared query options
  lib/           Shared utilities
  styles.css     Design tokens (source of docs/DESIGN.md front matter)

convex/
  schema.ts      Data model
  *.ts           Queries, mutations, actions, HTTP and cron workflows
  lib/           Shared server logic (visibility, city counters, feeds, ranking)
  *.test.ts      convex-test contract tests

playwright/      End-to-end specs (*.public.spec.ts, *.authenticated.spec.ts)
scripts/         Guardrail, generator and data scripts
public/fonts/    Self-hosted Geist and Geist Mono
docs/            Product, design and logic docs; plans/ holds plans and investigations
```

Repository instructions are in [AGENTS.md](AGENTS.md); each main directory has its own `AGENTS.md`.

## Deployment

The current deployment target is Cloudflare Workers.

```bash
pnpm deploy
```

That command runs the production build and then deploys with Wrangler. Worker environments (`development`, `production`) are defined in [wrangler.jsonc](wrangler.jsonc).

## CI/CD

GitHub Actions handles CI and deployment:

- [ci.yml](.github/workflows/ci.yml) runs `pnpm ci:quality` on pull requests and pushes to `dev` and `main`
- [convex-deploy.yml](.github/workflows/convex-deploy.yml) deploys Convex, then builds and deploys the Cloudflare Worker after CI succeeds: development from `dev`, production from `main`

Both deployments use the validated commit under one environment-scoped concurrency lock. A failed Convex deployment prevents the Worker deployment. One-off data backfills still require their documented completion checks; deployment success alone does not verify migrated data.

The workflows read Node and pnpm versions from [package.json](package.json) rather than duplicating them in YAML.

## Testing and Code Quality

- Unit and component tests use Vitest and Testing Library, colocated in `__tests__/` beside the code
- Convex functions are tested with `convex-test` (`convex/*.test.ts`, `convex/lib/__tests__/`) on shared fixtures in `convex/__tests__/`
- End-to-end tests use Playwright; public and authenticated specs are separate
- Formatting uses `oxfmt`; linting uses `oxlint`, including accessibility rules
- `pnpm check` also runs the contrast matrix, the arbitrary-value and `.collect()` guardrails and the design-token drift check
