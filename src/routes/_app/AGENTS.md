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

## ANTI-PATTERNS

- DO NOT add fixed-width containers — use CSS custom properties
- DO NOT create route-specific layout wrappers — use `.page-shell`
- DO NOT put business logic in routes — delegate to `src/features/`
- DO NOT bypass auth — all `_app/` routes are protected by layout
