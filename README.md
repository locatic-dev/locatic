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
VITE_CLERK_PUBLISHABLE_KEY=
CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=
```

The frontend expects:

- `VITE_CLERK_PUBLISHABLE_KEY` for the Clerk client provider
- `VITE_CONVEX_URL` for the Convex React client
- `CONVEX_DEPLOYMENT` for local Convex tooling

The Convex backend also expects Clerk server-side configuration:

- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`

There is also a Clerk webhook handler at `/clerk/webhooks`. If you enable webhook syncing locally or in production, configure the Clerk webhook signing secret in Convex as well.

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

### Clerk and GitHub Setup Notes

Locatic assumes users authenticate through Clerk with GitHub connected. The codebase uses Clerk's GitHub OAuth token to:

- list a user's public repositories during onboarding
- import selected repositories into Locatic
- star or unstar repositories when a user likes or unlikes a project

In practice, that means your Clerk setup needs GitHub OAuth configured with the permissions required for those flows.

### Seed Data and Background Jobs

The Convex backend includes scheduled jobs for:

- seeding default cities
- rebuilding Pulse snapshots
- refreshing active GitHub project metadata
- cleaning up feed and notification history

Default city seed data lives in [convex/citiesSeed.ts](convex/citiesSeed.ts), and the cron definitions live in [convex/crons.ts](convex/crons.ts).

## Available Scripts

```bash
pnpm dev
pnpm build
pnpm preview
pnpm test
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
