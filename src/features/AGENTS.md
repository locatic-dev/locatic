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
├── projects/         # Project detail, repo linking, sync feedback, post feed (posts/), reactions (reactions/), releases (releases/), README (readme/)
├── settings/         # User settings, preferences
├── viewer/           # Current user context + bootstrap queries
└── __tests__/        # Cross-feature tests
```

## WHERE TO LOOK

| Task                        | Location                                                        | Notes                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add new feature             | `features/<name>/`                                              | Create dir with hooks, types, components                                                                                                                                                     |
| Shared types                | `contracts.ts`                                                  | Cross-feature type definitions                                                                                                                                                               |
| Search state                | `explore/state.ts`, `profile/state.ts`                          | Normalize route search params; `getExploreLoaderDeps` for stable deps                                                                                                                        |
| Debounced search            | `explore/use-debounced-route-search.ts`                         | Route-synced debounced input with rapid clear/backspace handling                                                                                                                             |
| Notification routing        | `notifications/navigation.ts`                                   | `getNotificationDestination` — converts db target to router dest                                                                                                                             |
| Inbox destinations          | `inbox/navigation.ts`                                           | `getInboxDestinationSearch` for conversation nav, `getInboxComposeSearch` for compose flow                                                                                                   |
| Inbox compose flow          | `inbox/` + `routes/_app/inbox.tsx`                              | Two-phase: `findWithUser` query → navigate to compose → `sendFirstMessage` mutation                                                                                                          |
| Project card preview        | `project-card-preview.ts`                                       | `toProjectCardData`, `getProjectCardRouteParams` mapping helpers                                                                                                                             |
| Liked-by display            | `projects/likes/liked-by-summary.tsx`                           | Avatar stack + count + expandable dialog with paginated likers                                                                                                                               |
| Home feed card              | `home/home-feed-card.tsx`                                       | `HomeFeedCard` component with grouped/single event rendering, targets, touch targets                                                                                                         |
| Home feed copy helpers      | `home/feed-copy.ts`                                             | `getHomeFeedSummary` — grouped event labels, day-relative time, pluralization; `post_created` uses "post" (not "update")                                                                     |
| Home feed cache/state       | `home/cache.ts`, `home/render-state.ts`                         | `HomeFeedItem` types, `getHomeFeedRenderState` for loading/empty/items, `getHomeFeedHandoffState` for SSR-to-live transition, `HOME_FEED_EXPANDED_PREVIEW_LIMIT`, target openability helpers |
| Dormant Home pulse rail     | `home/home-rail.tsx`                                            | `HomePulseRail` is dead/dormant code for a possible future weekly pulse right rail; not rendered by Home currently                                                                           |
| GitHub sync logic           | `github/`                                                       | API calls, webhook handlers                                                                                                                                                                  |
| City search                 | `cities/`                                                       | Geolocation, city data                                                                                                                                                                       |
| Current user data           | `viewer/`                                                       | Authenticated user context, route payloads                                                                                                                                                   |
| Onboarding helpers          | `onboarding/helpers.ts`                                         | Repo-derived stack prefs, owned projects                                                                                                                                                     |
| Profile posts UI            | `profile/post-list.tsx`                                         | `ProfilePostList` component; tab-gated query for profile posts tab                                                                                                                           |
| Profile content tabs        | `profile/content-tabs.tsx`                                      | Responsive grid `grid-cols-2 min-[520px]:grid-cols-3 lg:grid-cols-5`; supports `posts` tab                                                                                                   |
| Profile network UI          | `profile/network-section.tsx`                                   | Follow graph section; loading skeleton + private visibility gating                                                                                                                           |
| Profile state helpers       | `profile/state.ts`                                             | `normalizeProfileSearch`, `isProfileContributionsPublic`, `getVisibleProfileContentTabs`, `getVisibleProfileContentTab` — tab + search visibility gating by privacy                         |
| Public profile contributions | `profile/public-profile-contributions.tsx`                     | `PublicProfileContributionGraph` + `PublicProfileContributionsList` for public profile contributions tab                                                                                     |
| Public profile projects     | `profile/public-profile-projects-list.tsx`                     | `PublicProfileProjectsList` component for public profile projects tab                                                                                                                        |
| Public profile liked        | `profile/public-profile-liked-projects-list.tsx`               | `PublicProfileLikedProjectsList` component; privacy-gated via `visible` prop                                                                                                                 |
| Privacy settings            | `settings/privacy-visibility-settings.tsx`                     | `PrivacyVisibilitySettings` component — toggles for comment/liked/contributions/follow graph visibility                                                                                      |
| Project likes               | `projects/mutations.ts`                                         | Locatic-only like/unlike actions; no GitHub star sync                                                                                                                                        |
| Reaction bar UI             | `projects/reactions/reaction-bar.tsx`                           | `ReactionBar` component — multi-reaction types (like/rocket/flame), emoji popover picker, optimistic updates                                                                                 |
| Reaction bar tests          | `projects/reactions/__tests__/reaction-bar.test.tsx`            | Vitest + Testing Library tests for ReactionBar                                                                                                                                               |
| Comment/Post contracts      | `contracts.ts`                                                  | `viewerReactionTypes`, `reactionCounts` on `ThreadedProjectComment`, `ProfilePostPreview`                                                                                                    |
| Project post feed           | `projects/posts/project-posts-section.tsx`                      | Paginated post list via `usePaginatedQuery` on project detail                                                                                                                                |
| Project releases section    | `projects/releases/project-releases-section.tsx`                | `ProjectReleasesSection` — renders GitHub releases with markdown body preview, pre-release badge                                                                                             |
| Project releases tests      | `projects/releases/__tests__/project-releases-section.test.tsx` | Vitest tests for releases section rendering                                                                                                                                                  |
| Project markdown components | `projects/readme/markdown-prose.tsx`                            | `projectMarkdownComponents`, `ProjectMarkdownPreview` — shared markdown rendering for README and releases; extracted from `project-readme-section.tsx`                                       |
| Explore post click          | `explore/components/explore-feed.tsx`                           | Post results click navigates to project page via `onOpenPostResult`                                                                                                                          |
| Explore post dismiss        | `explore/mutations.ts`                                          | `useDismissExplorePost`, `useResetExplorePosts`                                                                                                                                              |
| Explore load more           | `explore/components/explore-feed.tsx`                           | Incremental via `onLoadMoreProjects`/`onLoadMorePosts` with limit step                                                                                                                       |
| Explore query transitions   | `explore/query-transitions.ts`                                  | `keepPreviousExploreFeedData`/`keepPreviousPostSearchData` for smooth data retention during filter changes                                                                                   |
| Home feed render state      | `home/render-state.ts`                                          | `getHomeFeedRenderState` for loading/empty/items states                                                                                                                                      |
| Comment composer styles     | `projects/comments/composer-styles.ts`                          | `commentComposerTextareaClass` shared textarea style constant                                                                                                                                |
| Profile comment navigation  | `profile/comment-navigation.ts`                                 | `getProfileCommentDestination` builds deep-link with `comment`/`commentPath`/`thread`/`post` search params; `isCommentTargetOpenable` gates by `targetAvailability`                          |
| Project deep link           | `projects/deep-link.ts`                                         | `getProjectDeepLinkTab`, `parseCommentPathSearch`, `getCommentExpansionPath`, `shouldAutoLoadDeepLinkPage`; tab routing + comment expansion from URL search params                           |

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
- Explore feed uses `placeholderData` with `keepPreviousExploreFeedData`/`keepPreviousPostSearchData` for smooth filter transitions; retains previous data when scope/cityIds/search query unchanged.
- Home feed uses `getHomeFeedRenderState` (empty/loading/items) for distinct render states.
- Home feed handoff: `getHomeFeedHandoffState` merges SSR items into live paginated state; SSR items display while first page loads, replaced by live results on resolution.
- `HomePulseRail` is intentionally dormant/dead code; keep it unrendered until the Home pulse/right-rail product direction is revived.
- Explore header: mode tabs render as chip-style toggle group inside a command band (`flex-col lg:flex-row`); active mode uses `bg-selected`/`text-brand`, inactive uses `text-text-muted`.
- Comment composer textarea styles live in `projects/comments/composer-styles.ts` as the `commentComposerTextareaClass` constant; shared between `comment-thread.tsx` and `project-post-card.tsx`.
- Reaction bar uses `reactToTarget`/`unreactFromTarget` mutations with optimistic updates; fetches reaction config via `reactions.listConfig` Convex query.
- Profile content tabs use responsive grid: `grid-cols-2 min-[520px]:grid-cols-3 lg:grid-cols-5`; supports `posts` tab alongside projects/contributions/liked.
- Profile posts tab uses tab-gated queries: enabled only when `tab === 'posts'`; matches pattern set by projects/contributions tabs.
- Profile network section has `isPrivate` + `loading` props; hides follower/following tab switcher when follow graph is private.
- Public profile tabs use `isProfileContributionsPublic`, `getVisibleProfileContentTabs`, and `getVisibleProfileContentTab` to hide private contribution tabs and normalize invalid tab search params.
- Public profile projects/contributions/liked lists live in extracted components; keep tab rendering there instead of rebuilding inline route markup.
- Privacy visibility settings live in `settings/privacy-visibility-settings.tsx`; keep comment, liked, contributions, and follow graph toggles together.
- Profile comment navigation: `getProfileCommentDestination` builds route with `comment`/`commentPath`/`thread`/`post` search params; supports both `project` and `post` target types; `isCommentTargetOpenable` gates by `targetAvailability`
- Project deep link tab routing: `getProjectDeepLinkTab({commentId, postId, postsCount})` — comment param selects `discussion` tab, post param selects `posts` tab, default falls back to `posts` if count > 0 else `readme`
- Deep link pagination: `shouldAutoLoadDeepLinkPage` gates auto-load with attempt limit (`DEEP_LINK_LOAD_MORE_ATTEMPT_LIMIT = 5`); `getCommentExpansionPath` prefers explicit `ancestorCommentIds` over `rootCommentId` fallback for availability
- Deep link helpers: `normalizeProjectSearchParam` cleans raw search params; `stripProjectCommentSearch` strips `comment`/`commentPath`/`thread` from search for navigation cleanup; `shouldSyncProjectTab` controls tab sync gated on deep-link target
- Reaction config migrated from `icon` slug to `emoji`+`color` fields; `convex/lib/reaction_config.ts` provides `normalizeReactionEmoji` and `sanitizeReactionConfigForWrite`
- Project markdown rendering extracted to `projects/readme/markdown-prose.tsx`; shared between README section and releases section

## ANTI-PATTERNS

- DO NOT import between feature directories directly — use `contracts.ts`
- DO NOT put route-level logic inside features
- DO NOT normalize search params inside routes when a feature `state.ts` exists
- DO NOT duplicate destination/copy maps across routes and feature helpers
- DO NOT bypass feature hooks/helpers to access internal components
