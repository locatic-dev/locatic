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
- `explore.tsx` search results navigate with function-form `search: (current) => ({...current, ...next})` — keep existing search params when updating.
- `home.tsx` uses Convex `usePaginatedQuery` directly (not TanStack Query) for paginated feed list; uses `getHomeFeedRenderState` for loading/empty/items states with `HomeFeedSkeletonRows` during `LoadingFirstPage`.
- `explore.tsx` supports post dismissal (dismissed set + load-more limit stepping) and reset dismissed for both projects and posts; uses `placeholderData` with `keepPreviousExploreFeedData`/`keepPreviousPostSearchData` for smooth filter transitions.
- `inbox.tsx` uses two-phase compose flow: validates `compose` search param, shows recipient preview via `conversationRecipientPreviewQueryOptions`.
- `profile.tsx` uses tab-gated queries for posts/projects/contributions/liked tabs; the owner follow graph is always available on the private profile, regardless of public `followGraphVisibility`.
- `profile.tsx` preloader fetches overview first, then fetches the active owner follow graph; loader returns overview for immediate render.

## ANTI-PATTERNS

- DO NOT add fixed-width containers — use CSS custom properties
- DO NOT create route-specific layout wrappers — use `.page-shell`
- DO NOT put business logic in routes — delegate to `src/features/`
- DO NOT bypass auth — all `_app/` routes are protected by layout
- DO NOT duplicate route search normalization or destination mapping inside protected route files
