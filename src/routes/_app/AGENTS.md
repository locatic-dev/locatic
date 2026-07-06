# ROUTES/\_APP — Authenticated Responsive Routes

## OVERVIEW

Protected routes with mobile-first responsive layouts. All require authentication via `_app` layout.

## STRUCTURE

```
_app/
├── home.tsx             # Main feed — stacked cards mobile, grid desktop
├── explore.tsx          # Discovery — full-width mobile, constrained desktop
├── inbox.tsx            # Messages — single column mobile, split-pane desktop
├── notifications.tsx    # Notifications — list view, touch-friendly items
├── profile.tsx          # User profile — stacked sections mobile
├── project.$owner.$repo.tsx  # Project detail — wrapping content, no overflow
└── settings.tsx         # Settings — grouped sections, full-width mobile
```

## CONVENTIONS

- All routes use `.page-shell` + `.page-shell__content` for consistent spacing
- Content: `w-full` mobile, shared layout-width helpers desktop
- Lists: single column mobile, consider grid/list toggle on desktop
- Forms: full-width inputs mobile, constrained width desktop
- Use shared layout tokens from `src/styles.css` for gaps and max-widths
- Safe-area padding: handled by `.page-shell` — do not add manually
- Tailwind-first styling: semantic tokens (`bg-surface`, `text-text-muted`, `rounded-card`) replace inline style blocks
- Profile, settings, notifications routes simplified — large inline style blocks replaced with utility classes
- Authenticated routes now lean on suspense queries + route-pending fallbacks; keep loading UI in the shared pending component, not inline per route.
- Intent preloading stays off for sidebar/tab routes to avoid fast-switch crashes.
- Explore/profile routes should use feature search-state helpers; inbox/notifications should use feature navigation helpers.
- Shared Convex query options live in `src/integrations/convex/query-options.ts`; use them for loader prefetches.
- `project.$owner.$repo.tsx` delegates post creation and listing to `ProjectPostsSection` component in `src/features/projects/posts/`.
- `project.$owner.$repo.tsx` supports deep-link comment/post navigation via search params: `comment` scrolls to thread, `post` selects posts tab, `commentPath` expands ancestor chain; auto-loads more pages when target comment not yet loaded (max 5 attempts).
- `profile.tsx` now passes deep-link search params (`comment`, `commentPath`, `thread`, `post`) through to project page navigation via `getProfileCommentDestination`.
- `explore.tsx` search results navigate with function-form `search: (current) => ({...current, ...next})` — keep existing search params when updating.
- `explore.tsx` persists current explore search state (mode, query, scope, cityIds) to sessionStorage via `writeStoredExploreSearch` on every filter change — nav links resume this state via `useResumeExploreSearch`.
- `home.tsx` uses Convex `usePaginatedQuery` directly (not TanStack Query) for paginated feed list; uses `getHomeFeedRenderState` for loading/empty/items states with `HomeFeedSkeletonRows` during `LoadingFirstPage`; uses `getHomeFeedHandoffState` for SSR-to-live feed transition; Explore button uses `getResumeExploreSearch` to restore previous search state.
- `home.tsx` does not render `HomePulseRail`; `src/features/home/home-rail.tsx` is dormant/dead code for a possible future pulse right rail.
- `settings.tsx` delegates privacy visibility toggles to `PrivacyVisibilitySettings` component in `src/features/settings/`; handles `contributionsVisibility` alongside comment/liked/follow graph settings.
- `settings.tsx` uses `getSettingsDirty` + `persistedAccountState` for dirty tracking on the account form; form state initialized from viewer snapshot via `getSettingsAccountStateFromViewer`. Sticky save bar at bottom shows "unsaved changes" / "discard" / "save changes" when dirty; positioned with `sticky bottom-[var(--lx-mobile-tab-height)] md:bottom-4` and `shadow-floating`.
- `settings.tsx` tab switching uses `handleSettingsTabChange` with manual window.confirm for dirty forms + form reset on leave; coordinates with `useUnsavedChangesGuard` via `allowNextNavigationRef`.
- `settings.tsx` uses `lx-page-width-form-left` (left-aligned, not centered) for the form content area.
- `explore.tsx` supports post/project dismissal + reset for both projects and posts; browse queries (projects/posts/builders) use Convex `usePaginatedQuery` with `loadMore(20)` — no caps. Search-mode post query uses `postSearchQueryOptions` with `keepPreviousPostSearchData` and `postSearchLimit` state — browse uses pagination (`browsePage`), search grows the limit (`growSearchLimit`), reset on filter change.
- `inbox.tsx` uses two-phase compose flow: validates `compose` search param, shows recipient preview via `conversationRecipientPreviewQueryOptions`.
- `inbox.tsx` own message bubbles use `bg-outgoing border border-brand/30` (not `bg-brand`); unread badges use `bg-unread`.
- `profile.tsx` uses tab-gated queries for posts/projects/contributions/liked tabs; the owner follow graph is always available on the private profile, regardless of public `followGraphVisibility`.
- `profile.tsx` preloader fetches overview first, then fetches the active owner follow graph; loader returns overview for immediate render.

## ANTI-PATTERNS

- DO NOT add fixed-width containers — use CSS custom properties
- DO NOT create route-specific layout wrappers — use `.page-shell`
- DO NOT put business logic in routes — delegate to `src/features/`
- DO NOT bypass auth — all `_app/` routes are protected by layout
- DO NOT duplicate route search normalization or destination mapping inside protected route files
