# APP-SHELL — Mobile-First Layout

## OVERVIEW

Layout components: collapsible sidebar, wrapped header, mobile tab bar, app layout wrapper.

## STRUCTURE

```
app-shell/
├── app-layout.tsx       # Main layout: sidebar + content area + mobile tab bar
├── sidebar-nav.tsx      # Collapsible nav (hidden mobile, visible desktop)
├── page-header.tsx      # Header with wrapped actions, safe-area padding
├── route-pending.tsx    # Shared suspense/pending fallback UI
└── mobile-tab-bar.tsx   # Bottom tab navigation (mobile only, hidden md+)
```

## WHERE TO LOOK

| Task                    | File                                     | Notes                         |
| ----------------------- | ---------------------------------------- | ----------------------------- |
| Add nav item            | `sidebar-nav.tsx` + `mobile-tab-bar.tsx` | Update both for consistency   |
| Modify layout structure | `app-layout.tsx`                         | Main composition point        |
| Add header action       | `page-header.tsx`                        | Actions wrap on small screens |
| Persist sidebar state   | `src/lib/sidebar-layout.ts`              | Shared collapse parsing/key   |
| Skip-link behavior      | `src/lib/skip-link.ts`                   | Keyboard modality/focus reset |

## CONVENTIONS

- Sidebar: hidden on mobile (`hidden md:flex`), collapsible on desktop
- Mobile tab bar: visible only on mobile (`flex md:hidden`), fixed bottom with safe-area padding
- Page header: actions use `flex-wrap`, gap tokens (`--space-*`), safe-area top padding
- App layout: uses `.page-shell` class for consistent spacing
- Scroll: content area scrolls independently, header/sidebar fixed
- Route pending UI is shared here; keep route-specific loading states out of individual routes.
- Sidebar collapse state is stored through `src/lib/sidebar-layout.ts`; keep the key/parsing centralized.
- Skip-link keyboard modality lives in `src/lib/skip-link.ts`; shell components should just consume it.

## ANTI-PATTERNS

- DO NOT add business logic to shell components — layout only
- DO NOT use fixed positioning without safe-area padding (`env(safe-area-inset-*)`)
- DO NOT forget to update mobile tab bar when adding sidebar nav items
- DO NOT use `overflow: hidden` on the body — scroll happens in content area
- DO NOT duplicate sidebar collapse storage or skip-link focus logic in shell components
