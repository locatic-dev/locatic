# FEATURES — Domain Modules

## OVERVIEW

Feature modules encapsulating domain logic, hooks, and types. Each feature is self-contained.

## STRUCTURE

```
features/
├── cities/           # City-based developer discovery
├── explore/          # Discover developers/projects by location; scope/search state
├── follows/          # Follow/unfollow developers
├── github/           # GitHub API integration, repo sync
├── home/             # Main feed, activity stream, copy helpers
├── inbox/            # Messaging, conversations, destination helpers
├── notifications/    # Notification system, read state, routing
├── onboarding/       # New user onboarding flow, repo-derived prefs
├── profile/          # User profiles (public + private), tab/search state
├── projects/         # Project management, repo linking, sync feedback
├── settings/         # User settings, preferences
├── viewer/           # Current user context + bootstrap queries
├── contracts.ts      # Shared type contracts between features
└── __tests__/        # Cross-feature tests
```

## WHERE TO LOOK

| Task               | Location                                             | Notes                                      |
| ------------------ | ---------------------------------------------------- | ------------------------------------------ |
| Add new feature    | `features/<name>/`                                   | Create dir with hooks, types, components   |
| Shared types       | `contracts.ts`                                       | Cross-feature type definitions             |
| Search state       | `explore/state.ts`, `profile/state.ts`               | Normalize route search params              |
| Destination maps   | `notifications/navigation.ts`, `inbox/navigation.ts` | Keep route targets in one place            |
| Feed copy          | `home/activity-labels.ts`                            | Activity labels and card copy              |
| GitHub sync logic  | `github/`                                            | API calls, webhook handlers                |
| City search        | `cities/`                                            | Geolocation, city data                     |
| Current user data  | `viewer/`                                            | Authenticated user context, route payloads |
| Onboarding helpers | `onboarding/helpers.ts`                              | Repo-derived stack prefs, owned projects   |
| Profile network UI | `profile/network-section.tsx`                        | Follow graph section                       |
| Sync feedback      | `projects/github-sync-feedback.ts`                   | Toasts for GitHub sync failures            |

## CONVENTIONS

- Each feature directory contains: hooks, types, components specific to that domain
- Features communicate via `contracts.ts` for shared types
- Routes import from features, not vice versa
- Feature hooks are the primary interface — routes call hooks, not internal components
- State/search/navigation helpers live beside the feature they normalize (`state.ts`, `navigation.ts`, `helpers.ts`); keep them with the domain.
- Viewer queries now feed route-prefetch payloads; keep contract names stable when editing `viewer/queries.ts`.

## ANTI-PATTERNS

- DO NOT import between feature directories directly — use `contracts.ts`
- DO NOT put route-level logic inside features
- DO NOT normalize search params inside routes when a feature `state.ts` exists
- DO NOT duplicate destination/copy maps across routes and feature helpers
- DO NOT bypass feature hooks/helpers to access internal components
