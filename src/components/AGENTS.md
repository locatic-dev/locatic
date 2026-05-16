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
│   ├── sidebar.tsx
│   ├── header.tsx
│   └── ...           # Navigation, layout wrappers
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

## ANTI-PATTERNS

- DO NOT add business logic to UI components
- DO NOT bypass shadcn/ui for standard primitives
- DO NOT add global styles — use Tailwind classes
