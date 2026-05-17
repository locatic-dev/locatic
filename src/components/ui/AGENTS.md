# UI — shadcn/ui Primitives

## OVERVIEW

Radix-based UI primitives with responsive hardening for smaller viewports.

## STRUCTURE

```
ui/
├── button.tsx           # Touch-friendly (min 44px)
├── card.tsx             # Fluid content wrapping
├── dialog.tsx           # Mobile-safe (full-screen on small)
├── dropdown-menu.tsx    # Touch-optimized items
├── input.tsx            # Responsive width
├── empty-state.tsx      # Content wrapping, reduced padding mobile
├── project-card.tsx     # Overflow-safe, wrapping titles
├── city-pill.tsx        # Compact, touch-friendly
├── status-pill.tsx      # Compact, touch-friendly
└── __tests__/           # Component tests
```

## CONVENTIONS

- All components: `break-words` + `overflow-wrap: anywhere` for long content
- Interactive elements: min 44px touch target (Tailwind `min-h-11 min-w-11`)
- Use `max-w-full` + `truncate` or `break-words` — never let content escape viewport
- Dialog: consider full-screen on mobile, centered on desktop
- Pills (CityPill, StatusPill): inline-flex, shrink-safe, no text overflow
- Tailwind-first styling: `EmptyState`, `ProjectCard` migrated from inline styles to semantic utility classes
- Use semantic tokens: `bg-surface`, `text-text-muted`, `rounded-card`, `shadow-card` instead of `var(--lx-*)`
- Inline `style={{}}` only for dynamic runtime values — never for static layout

## ANTI-PATTERNS

- DO NOT use `whitespace-nowrap` on user-generated content
- DO NOT set fixed widths on cards — use `w-full max-w-*`
- DO NOT rely on hover states — always provide touch/click alternative
- DO NOT use `overflow-hidden` on content containers without scroll fallback
