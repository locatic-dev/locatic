# Locatic

Locatic is a developer discovery app: GitHub with a map. Showcase public repositories, find builders by city, follow their work, and start conversations.

## Features

- Public Explore, city, project, and profile pages.
- GitHub sign-in, repository import, and metadata synchronization.
- A Home feed of recent activity from people you follow.
- Project reactions, comments, posts, private saves, and direct messages.
- Server-enforced profile, location, follow-graph, and calendar privacy.
- Account deletion with a 30-day recovery window before irreversible cleanup.

The app uses React 19, TanStack Start/Router/Query, Convex, Clerk, Tailwind CSS v4, and Cloudflare Workers.

## Develop locally

Use Node 24 and the pnpm version pinned in [package.json](package.json).

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Follow [Contributor setup](docs/CONTRIBUTOR_SETUP.md) to configure your own Clerk development application, GitHub connection, and Convex project. Keep credentials in local or provider environment configuration.

Run the backend and frontend in separate terminals:

```sh
pnpm exec convex dev
```

```sh
pnpm dev
```

The frontend starts at `http://localhost:3000`. `convex dev` uploads backend source to the selected development project.

## Check changes

```sh
pnpm ci:quality
pnpm ci:build
pnpm exec playwright install chromium
pnpm e2e:components
```

The build needs public placeholder variables when no provider project is configured; see [Contributor setup](docs/CONTRIBUTOR_SETUP.md#checks-without-provider-accounts). Component browser tests use production views with memory adapters. Full provider-backed tests need the isolated personas described in [Development QA](docs/DEVELOPMENT_QA.md).

## Documentation

- [Contributing](CONTRIBUTING.md) and [security reports](SECURITY.md).
- [Product principles](docs/PRODUCT.md) and [design system](docs/DESIGN.md).
- [Discovery and Home behavior](docs/explore-home-logic.md) and [data model](docs/Locatic_Database_Design.md).
- [Community email](docs/community-email.md), [metrics](docs/metrics.md), and [dependency maintenance](docs/DEPENDENCY_MAINTENANCE.md).
- [Operations and migrations](docs/OPERATIONS.md).

Repository instructions are in [AGENTS.md](AGENTS.md). The package scripts list the available build, test, data, and deployment commands. CI runs quality, build, and component-browser checks. Existing deployment workflows run after successful CI pushes to `dev` or `main`; review [Operations](docs/OPERATIONS.md) before deploying.

## License

Locatic source is available under the [MIT License](LICENSE). Dependencies, fonts, datasets, and remote member content retain their own rights and attribution requirements. See [Third-party notices](THIRD_PARTY_NOTICES.md).
