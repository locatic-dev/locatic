# FEATURES — Domain Modules

## OVERVIEW

Feature modules encapsulating domain logic, hooks, and types. Each feature is self-contained.

## STRUCTURE

```
features/
├── cities/           # City-based developer discovery
├── explore/          # Discover developers/projects by location
├── follows/          # Follow/unfollow developers
├── github/           # GitHub API integration, repo sync
├── home/             # Main feed, activity stream
├── inbox/            # Messaging, conversations
├── notifications/    # Notification system
├── onboarding/       # New user onboarding flow
├── profile/          # User profiles (public + private)
├── projects/         # Project management, repo linking
├── settings/         # User settings, preferences
├── viewer/           # Current user context
├── contracts.ts      # Shared type contracts between features
└── __tests__/        # Cross-feature tests
```

## WHERE TO LOOK

| Task              | Location           | Notes                                    |
| ----------------- | ------------------ | ---------------------------------------- |
| Add new feature   | `features/<name>/` | Create dir with hooks, types, components |
| Shared types      | `contracts.ts`     | Cross-feature type definitions           |
| GitHub sync logic | `github/`          | API calls, webhook handlers              |
| City search       | `cities/`          | Geolocation, city data                   |
| Current user data | `viewer/`          | Authenticated user context               |

## CONVENTIONS

- Each feature directory contains: hooks, types, components specific to that domain
- Features communicate via `contracts.ts` for shared types
- Routes import from features, not vice versa
- Feature hooks are the primary interface — routes call hooks, not internal components

## ANTI-PATTERNS

- DO NOT import between feature directories directly — use `contracts.ts`
- DO NOT put route-level logic inside features
- DO NOT bypass feature hooks to access internal components
