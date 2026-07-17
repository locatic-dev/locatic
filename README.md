# Locatic

Locatic is a location-aware developer discovery product built around a simple idea: **GitHub with a map.**

Developers sign in with GitHub, choose which repositories to showcase, set their city, and discover what other people are building nearby or across the world. The core interaction loop is social and project-first: follow builders, like projects, comment on work, and start direct conversations.

## What Exists Today

The repository already includes the core MVP surfaces and backend model:

- Public landing page
- GitHub sign-in with Clerk
- Multi-step onboarding for profile, city, and repository selection
- Authenticated Home feed for followed builders
- Authenticated Explore feed driven by city preferences
- Project detail pages with likes and comments
- Public user profiles
- Inbox, notifications, profile, and settings
- Convex data model and cron jobs for feeds, sync, cleanup, and Pulse snapshots

The current codebase also makes a clear distinction between what is implemented now and what is still planned:

- Pulse ranking logic exists in Convex
- A dedicated Pulse UI route is not implemented yet
- The broader map-heavy browsing experience is still future scope

## Product Model

Locatic organizes discovery into distinct surfaces:

- **Home** is the personal feed. It shows projects and activity from people you follow.
- **Explore** is the discovery feed. It pulls projects from selected cities and uses lightweight preference signals.
- **Project detail** is the main conversion surface for likes, comments, follow actions, and repository context.
- **Profile** presents a builder's identity, selected projects, comment history, and liked work depending on privacy settings.
- **Inbox** supports direct builder-to-builder messaging.
- **Settings** controls account data, privacy, notifications, and connected account state.

The current application stays intentionally scoped to the MVP surfaces listed above. Data model details are documented in [docs/Locatic_Database_Design.md](docs/Locatic_Database_Design.md).

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

- `.env.local` has `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CONVEX_URL`, `CLERK_SECRET_KEY`, and `E2E_CLERK_USER_EMAIL`
- the dedicated Clerk test user exists in the development Clerk instance
- the Convex dev deployment is running and configured with `CLERK_JWT_ISSUER_DOMAIN`

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

The Convex backend includes scheduled jobs for:

- seeding default cities
- rebuilding Pulse snapshots
- refreshing active GitHub project metadata
- cleaning up feed and notification history

Default city seed data lives in [convex/citiesSeed.ts](convex/citiesSeed.ts), and the cron definitions live in [convex/crons.ts](convex/crons.ts).

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
pnpm dev
pnpm build
pnpm preview
pnpm test
pnpm e2e
pnpm e2e:auth
pnpm e2e:headed
pnpm e2e:ui
pnpm lint
pnpm typecheck
pnpm format
pnpm check
pnpm ci:quality
pnpm ci:build
pnpm deploy:convex
pnpm deploy
```

## Project Structure

```text
src/
  routes/        TanStack file-based routes
  features/      Domain query and mutation adapters
  components/    App shell and reusable UI
  integrations/  Clerk, Convex, and TanStack Query wiring
  lib/           Shared utilities

convex/
  schema.ts      Primary data model
  *.ts           Queries, mutations, actions, and cron workflows

docs/
  Locatic_Database_Design.md
```

There is also route-specific guidance in [src/routes/AGENTS.md](src/routes/AGENTS.md), plus additional repository instructions in [AGENTS.md](AGENTS.md).

## Deployment

The current deployment target is Cloudflare Workers.

```bash
pnpm deploy
```

That command runs the production build and then deploys with Wrangler.

Before deploying, review [wrangler.jsonc](wrangler.jsonc). The worker name is still set to the starter default and should be changed to a production-appropriate value for Locatic.

## CI/CD

GitHub Actions handles repository CI and Convex production deployment:

- [ci.yml](.github/workflows/ci.yml) runs quality checks on pull requests and pushes to `main`
- [convex-deploy.yml](.github/workflows/convex-deploy.yml) deploys Convex production only after CI succeeds on `main`
- Cloudflare frontend deploys remain managed by Cloudflare Git integration

The workflows read Node and pnpm versions from [package.json](package.json) rather than duplicating them in YAML.

## Testing and Code Quality

- Unit tests use Vitest
- Formatting uses `oxfmt`
- Linting uses `oxlint`

Tests currently cover utilities, contract mapping, onboarding helpers, and selected Convex library logic.
