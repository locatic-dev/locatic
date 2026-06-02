# UI — shadcn/ui Primitives

## OVERVIEW

Radix-based UI primitives with responsive hardening for smaller viewports.

## STRUCTURE

```
ui/
├── avatar.tsx             # Radix avatar with fallback
├── badge.tsx              # Inline badge / status indicator
├── brand-icon.tsx         # Brand SVG icon component
├── button.tsx             # Touch-friendly (min 44px)
├── card.tsx               # Fluid content wrapping
├── checkbox.tsx           # Radix checkbox
├── city-combobox.tsx      # City search combobox
├── city-pill.tsx          # Compact, touch-friendly city label
├── command.tsx            # Radix command palette
├── contribution-graph.tsx # GitHub-style contribution chart
├── dialog.tsx             # Mobile-safe (full-screen on small)
├── dot-map.tsx            # Geographic dot map visualization
├── dropdown-menu.tsx      # Touch-optimized items
├── empty-state.tsx        # Content wrapping, reduced padding mobile
├── input.tsx              # Responsive width input
├── label.tsx              # Radix label
├── lang-dot.tsx           # Language dot indicator
├── logo.tsx               # App logo component
├── lx-avatar.tsx          # Enhanced avatar with presence
├── popover.tsx            # Radix popover
├── project-card.tsx       # Overflow-safe, wrapping titles
├── radio-group.tsx        # Radix radio group
├── scroll-area.tsx        # Radix scroll area
├── select.tsx             # Radix select
├── separator.tsx          # Radix separator
├── sheet.tsx              # Radix sheet (slide-over panel)
├── skeleton.tsx           # Loading skeleton
├── sonner.tsx             # Sonner toast wrapper
├── status-pill.tsx        # Compact, touch-friendly status
├── switch.tsx             # Radix switch toggle
├── tabs.tsx               # Radix tabs
├── textarea.tsx           # Textarea with resize
├── tooltip.tsx            # Radix tooltip
└── __tests__/             # Component tests
```

## WHERE TO LOOK

| Task                 | File                                                                                       | Notes                                  |
| -------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| Add shadcn component | `ui/<name>.tsx`                                                                            | Use `shadcn add` CLI for new ones      |
| Avatar               | `avatar.tsx`, `lx-avatar.tsx`                                                              | User/org avatars with/without presence |
| Badge                | `badge.tsx`                                                                                | Inline status/tag indicator            |
| Brand icon           | `brand-icon.tsx`                                                                           | SVG brand icon component               |
| Button               | `button.tsx`                                                                               | Primary/secondary/ghost variants       |
| Card                 | `card.tsx`                                                                                 | Content containers                     |
| Checkbox             | `checkbox.tsx`                                                                             | Form checkbox                          |
| City combobox        | `city-combobox.tsx`                                                                        | City search autocomplete               |
| City pill            | `city-pill.tsx`                                                                            | Compact touch-friendly city label      |
| Command palette      | `command.tsx`                                                                              | Cmd-k / search overlay                 |
| Contribution graph   | `contribution-graph.tsx`                                                                   | Activity heatmap                       |
| Dialog               | `dialog.tsx`                                                                               | Modal dialogs                          |
| Dot map              | `dot-map.tsx`                                                                              | Geographic scatter plot                |
| Dropdown menu        | `dropdown-menu.tsx`                                                                        | Context menus                          |
| Empty state          | `empty-state.tsx`                                                                          | No-data/error placeholder              |
| Form controls        | `input.tsx`, `textarea.tsx`, `select.tsx`, `radio-group.tsx`, `switch.tsx`, `checkbox.tsx` | Inputs, selects, toggles               |
| Language dot         | `lang-dot.tsx`                                                                             | Programming language indicator         |
| Loading skeleton     | `skeleton.tsx`                                                                             | Content placeholder                    |
| Logo                 | `logo.tsx`                                                                                 | App logo                               |
| Popover              | `popover.tsx`                                                                              | Floating panels                        |
| Project card         | `project-card.tsx`                                                                         | Repo/project display card              |
| Scroll area          | `scroll-area.tsx`                                                                          | Custom scroll container                |
| Separator            | `separator.tsx`                                                                            | Visual divider                         |
| Sheet                | `sheet.tsx`                                                                                | Slide-over panel                       |
| Sonner toast         | `sonner.tsx`                                                                               | Toast notification wrapper             |
| Status pill          | `status-pill.tsx`                                                                          | Build/activity status indicator        |
| Tabs                 | `tabs.tsx`                                                                                 | Tabbed content sections                |
| Tooltip              | `tooltip.tsx`                                                                              | Hover/focus tooltip                    |

## CONVENTIONS

- All components: `break-words` + `overflow-wrap: anywhere` for long content
- Interactive elements: min 44px touch target (Tailwind `min-h-11 min-w-11`)
- Use `max-w-full` + `truncate` or `break-words` — never let content escape viewport
- Dialog/Sheet: full-screen on mobile, centered/panel on desktop
- Pills (CityPill, StatusPill): inline-flex, shrink-safe, no text overflow
- Tailwind-first styling: `EmptyState`, `ProjectCard` migrated from inline styles to semantic utility classes
- Use semantic tokens: `bg-surface`, `text-text-muted`, `rounded-card`, `shadow-card` instead of `var(--lx-*)`
- Inline `style={{}}` only for dynamic runtime values such as data-derived color, size, mask, or SVG paint — never for static layout
- Form controls preserve fallback IDs and label associations for autofill/a11y; keep those props intact when editing inputs, switches, and textareas.
- Dropdown menus must stay keyboard- and touch-safe; no hover-only affordances.

## ANTI-PATTERNS

- DO NOT use `whitespace-nowrap` on user-generated content
- DO NOT set fixed widths on cards — use `w-full max-w-*`
- DO NOT rely on hover states — always provide touch/click alternative
- DO NOT use `overflow-hidden` on content containers without scroll fallback
- DO NOT build action menus that fail on mobile tap targets or keyboard focus
