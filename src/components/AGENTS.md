# COMPONENTS — Shared UI

## OVERVIEW

Reusable UI components: shadcn/ui primitives and app-shell layout components.

## STRUCTURE

```
components/
├── ui/               # shadcn/ui components (31 files)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── input.tsx
│   ├── ...           # Radix-based primitives
│   └── __tests__/    # Component tests
├── app-shell/        # Layout components (4 files)
│   ├── app-layout.tsx    # Main app layout wrapper
│   ├── sidebar.tsx       # Collapsible sidebar
│   ├── header.tsx        # Page header with wrapped actions
│   └── mobile-tab-bar.tsx # Bottom tab bar (mobile only)
└── ...               # Top-level shared components
```

## WHERE TO LOOK

| Task                 | Location      | Notes                     |
| -------------------- | ------------- | ------------------------- |
| Add shadcn component | `ui/`         | Use `shadcn add` CLI      |
| Add layout component | `app-shell/`  | Sidebar, header, nav      |
| Add shared component | `components/` | Cross-feature UI elements |

## CONVENTIONS

- shadcn/ui components use Radix primitives + Tailwind v4
- `cn()` utility from `@/lib/utils` for className merging
- App-shell components handle layout structure only — no business logic
- Components accept props, no internal state for data fetching
- All UI primitives must work at 320px viewport — test content wrapping, overflow
- Touch targets: min 44px height/width for interactive elements
- Use CSS custom properties (`--space-*`) for spacing — no fixed px
- Dialog, Card, EmptyState: allow content wrapping (`break-words`, `overflow-wrap`)

## ANTI-PATTERNS

- DO NOT add business logic to UI components
- DO NOT bypass shadcn/ui for standard primitives
- DO NOT add global styles — use Tailwind classes or `src/styles.css`
- DO NOT use fixed-width containers — allow fluid content wrapping
- DO NOT create touch targets below 44px
- DO NOT hide overflow on scrollable containers without testing mobile
