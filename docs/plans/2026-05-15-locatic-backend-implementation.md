# Locatic Backend MVP Implementation

## Summary

Locatic will use Convex as the application backend for data modeling, reactive reads, write orchestration, background jobs, and internal event fan-out. Clerk remains the authentication provider and the source of truth for GitHub OAuth tokens. The MVP implementation stays aligned to the current PRD and database design, while leaving events and meetups as a documented v2 extension.

## Core Decisions

- Scope is limited to the current PRD and database design for MVP.
- GitHub OAuth tokens are fetched from Clerk in trusted server-side or Convex action flows.
- Convex stores GitHub token operational metadata only, not the token itself.
- Public SEO-friendly pages can use TanStack Query prefetching, while auth-heavy social surfaces remain client-reactive.
- Weekly digest support is implemented behind an adapter contract, without binding to a delivery vendor yet.

## Backend Areas

### Auth and platform

- Add Convex Clerk auth configuration.
- Replace the starter provider stack with Clerk + Convex + TanStack Query integration.
- Standardize Convex reads through `@convex-dev/react-query`.

### Data model

- Replace the demo Convex schema with the full Locatic MVP schema.
- Extend the design with missing privacy fields, Explore seen history, Pulse snapshots, and reports.
- Keep denormalized snapshot fields for hot feed and card reads.

### Domain modules

- Users, onboarding, settings, and privacy.
- Cities autocomplete and lookup.
- Projects, updates, follows, comments, reactions, conversations, notifications.
- Home feed, Explore feed, and Pulse rankings.

### Internal orchestration

- Shared auth guards and viewer resolution.
- Snapshot builders and feed fan-out helpers.
- GitHub sync, metadata refresh, contributor sync, cleanup, and digest scheduling.

## Testing

- Add Vitest configuration for backend-oriented unit and integration-style tests.
- Cover shared logic for privacy, Explore selection, Pulse ranking, and deterministic conversation keys.
- Cover critical Convex write flows, GitHub-like synchronization behavior, and cron-safe orchestration.

## V2 Appendix

Events and meetups should reuse:

- the existing city model
- follow and notification systems
- comment and reaction patterns
- public and private visibility rules

They are intentionally out of scope for the MVP implementation.
