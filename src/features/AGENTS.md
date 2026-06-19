# FEATURES — Domain Modules

## OVERVIEW

Feature modules encapsulating domain logic, hooks, and types. Each feature is self-contained.

## STRUCTURE

```
features/
├── cities/           # City-based developer discovery
├── contracts.ts      # Shared type contracts between features
├── explore/          # Discover devs/projects/posts by location; scope/search state, debounced search
├── follows/          # Follow/unfollow developers
├── github/           # GitHub API integration, repo sync
├── home/             # Main feed, activity stream, copy helpers
├── inbox/            # Messaging, conversations, destination helpers
├── notifications/    # Notification system, read state, routing
├── onboarding/       # New user onboarding flow, repo-derived prefs
├── profile/          # User profiles (public + private), tab/search state
├── project-card-preview.ts  # Project card preview logic (standalone)
├── projects/         # Project detail, repo linking, sync feedback, post feed (posts/)
├── settings/         # User settings, preferences
├── viewer/           # Current user context + bootstrap queries
└── __tests__/        # Cross-feature tests
```

## WHERE TO LOOK

| Task                 | Location                                   | Notes                                                                                      |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Add new feature      | `features/<name>/`                         | Create dir with hooks, types, components                                                   |
| Shared types         | `contracts.ts`                             | Cross-feature type definitions                                                             |
| Search state         | `explore/state.ts`, `profile/state.ts`     | Normalize route search params; `getExploreLoaderDeps` for stable deps                      |
| Debounced search     | `explore/use-debounced-route-search.ts`    | Route-synced debounced input with rapid clear/backspace handling                           |
| Notification routing | `notifications/navigation.ts`              | `getNotificationDestination` — converts db target to router dest                           |
| Inbox destinations   | `inbox/navigation.ts`                      | `getInboxDestinationSearch` for conversation nav, `getInboxComposeSearch` for compose flow |
| Inbox compose flow   | `inbox/` + `routes/_app/inbox.tsx`         | Two-phase: `findWithUser` query → navigate to compose → `sendFirstMessage` mutation        |
| Project card preview | `project-card-preview.ts`                  | `toProjectCardData`, `getProjectCardRouteParams` mapping helpers                           |
| Liked-by display     | `projects/likes/liked-by-summary.tsx`      | Avatar stack + count + expandable dialog with paginated likers                             |
| Feed copy            | `home/activity-labels.ts`                  | Activity labels and card copy                                                              |
| GitHub sync logic    | `github/`                                  | API calls, webhook handlers                                                                |
| City search          | `cities/`                                  | Geolocation, city data                                                                     |
| Current user data    | `viewer/`                                  | Authenticated user context, route payloads                                                 |
| Onboarding helpers   | `onboarding/helpers.ts`                    | Repo-derived stack prefs, owned projects                                                   |
| Profile network UI   | `profile/network-section.tsx`              | Follow graph section                                                                       |
| Project likes        | `projects/mutations.ts`                    | Locatic-only like/unlike actions; no GitHub star sync                                      |
| Project post feed    | `projects/posts/project-posts-section.tsx` | Paginated post list via `usePaginatedQuery` on project detail                              |
| Explore post click   | `explore/components/explore-feed.tsx`      | Post results click navigates to project page via `onOpenPostResult`                        |
| Explore post dismiss | `explore/mutations.ts`                     | `useDismissExplorePost`, `useResetExplorePosts`                                            |
| Explore load more    | `explore/components/explore-feed.tsx`      | Incremental via `onLoadMoreProjects`/`onLoadMorePosts` with limit step                     |

## CONVENTIONS

- Each feature directory contains: hooks, types, components specific to that domain
- Features communicate via `contracts.ts` for shared types
- Routes import from features, not vice versa
- Feature hooks are the primary interface — routes call hooks, not internal components
- State/search/navigation helpers live beside the feature they normalize (`state.ts`, `navigation.ts`, `helpers.ts`); keep them with the domain.
- Viewer queries now feed route-prefetch payloads; keep contract names stable when editing `viewer/queries.ts`.
- Inbox compose is two-phase: `findWithUser` query → navigate with `compose` param → `sendFirstMessage` mutation. No `startOrGet`.
- Explore post dismissal mirrors project dismissal pattern: dismiss mutation → filter locally via dismissed set → reset mutation.
- `getExploreScopeStatusCopy` now accepts optional `mode` param for mode-aware status copy.

## ANTI-PATTERNS

- DO NOT import between feature directories directly — use `contracts.ts`
- DO NOT put route-level logic inside features
- DO NOT normalize search params inside routes when a feature `state.ts` exists
- DO NOT duplicate destination/copy maps across routes and feature helpers
- DO NOT bypass feature hooks/helpers to access internal components
