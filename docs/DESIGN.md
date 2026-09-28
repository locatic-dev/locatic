---
# Generated from src/styles.css by scripts/generate-design-tokens.mjs.
# Do not edit by hand: run `pnpm design:tokens`. `pnpm check` runs
# `pnpm design:tokens:check`, which fails when this block drifts.
name: Locatic
description: 'GitHub with a map — developer discovery platform built around location.'
# Tailwind colour utilities (bg-*, text-*, border-*), default theme.
colors:
  canvas: 'oklch(13.5% 0.007 230)'
  surface-chrome: 'oklch(16% 0.007 230)'
  surface: 'oklch(18.5% 0.008 230)'
  surface-alt: 'oklch(22.5% 0.008 230)'
  surface-raised: 'oklch(26% 0.01 230)'
  surface-accent: 'oklch(72% 0.15 195 / 0.06)'
  line: 'oklch(30% 0.008 230)'
  line-strong: 'oklch(58% 0.008 230)'
  control: 'oklch(56% 0.008 230)'
  text: 'oklch(93% 0.005 230)'
  text-muted: 'oklch(72% 0.006 230)'
  text-faint: 'oklch(66% 0.006 230)'
  brand: 'oklch(72% 0.15 195)'
  brand-quiet: 'oklch(72% 0.15 195 / 0.14)'
  brand-foreground: 'oklch(14% 0.005 230)'
  brand-2: 'oklch(74% 0.11 300)'
  brand-2-quiet: 'oklch(74% 0.11 300 / 0.12)'
  selected: 'oklch(72% 0.15 195 / 0.16)'
  selected-bar: 'oklch(72% 0.15 195)'
  state-hover: 'oklch(22.5% 0.008 230)'
  focus: 'oklch(72% 0.15 195)'
  outgoing: 'oklch(72% 0.15 195 / 0.16)'
  unread: 'oklch(70% 0.1 195)'
  liked: 'oklch(69% 0.19 25)'
  success: 'oklch(70% 0.16 145)'
  warning: 'oklch(72% 0.18 75)'
  danger: 'oklch(69% 0.19 25)'
  place: 'oklch(78% 0.12 60)'
  place-quiet: 'oklch(78% 0.12 60 / 0.14)'
# Stock shadcn utilities: the Locatic colour they share, else their value.
shadcn-aliases:
  background: 'canvas'
  foreground: 'text'
  card: 'surface'
  card-foreground: 'oklch(93% 0.005 230)'
  popover: 'surface'
  popover-foreground: 'oklch(93% 0.005 230)'
  primary: 'brand'
  primary-foreground: 'brand-foreground'
  secondary: 'surface-alt'
  secondary-foreground: 'oklch(93% 0.005 230)'
  muted: 'surface-alt'
  muted-foreground: 'text-muted'
  accent: 'surface-alt'
  accent-foreground: 'oklch(93% 0.005 230)'
  destructive: 'danger'
  destructive-foreground: 'oklch(14% 0.005 230)'
  border: 'line'
  input: 'control'
  ring: 'brand'
  chart-1: 'brand'
  chart-2: 'oklch(70% 0.16 145)'
  chart-3: 'oklch(72% 0.18 75)'
  chart-4: 'oklch(68% 0.17 260)'
  chart-5: 'danger'
# Accent family per theme (<html data-theme>); every other token is shared.
themes:
  teal:
    default: true
    accent: 'oklch(72% 0.15 195)'
    accent-2: 'oklch(74% 0.11 300)'
  violet:
    accent: 'oklch(74% 0.15 292)'
    accent-2: 'oklch(75% 0.11 195)'
  amber:
    accent: 'oklch(76% 0.14 75)'
    accent-2: 'oklch(72% 0.11 210)'
fonts:
  sans: "'IBM Plex Sans', 'IBM Plex Sans Fallback', 'IBM Plex Sans Fallback Roboto', ui-sans-serif, system-ui, sans-serif"
  mono: "'IBM Plex Mono', 'IBM Plex Mono Fallback', 'IBM Plex Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
  self-hosted:
    'IBM Plex Mono': '400, 500, 600, 700'
    'IBM Plex Sans': '400, 500, 600'
# Type roles: Tailwind text-<role> utilities.
typography:
  display:
    fontFamily: "'IBM Plex Mono', 'IBM Plex Mono Fallback', 'IBM Plex Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
    fontSize: 'clamp(28px, 4vw, 40px)'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.025em'
  headline:
    fontFamily: "'IBM Plex Mono', 'IBM Plex Mono Fallback', 'IBM Plex Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '22px'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '-0.02em'
  title:
    fontFamily: "'IBM Plex Mono', 'IBM Plex Mono Fallback', 'IBM Plex Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '15px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.01em'
  body:
    fontFamily: "'IBM Plex Sans', 'IBM Plex Sans Fallback', 'IBM Plex Sans Fallback Roboto', ui-sans-serif, system-ui, sans-serif"
    fontSize: '14px'
    lineHeight: 1.6
  label:
    fontFamily: "'IBM Plex Mono', 'IBM Plex Mono Fallback', 'IBM Plex Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '12px'
    lineHeight: 1.4
    fontVariantNumeric: 'tabular-nums'
  meta:
    fontFamily: "'IBM Plex Mono', 'IBM Plex Mono Fallback', 'IBM Plex Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '11px'
    lineHeight: 1.4
    fontVariantNumeric: 'tabular-nums'
rounded:
  control: '0.25rem'
  card: '0.375rem'
  pill: '999px'
# Stock radius steps and what they render as.
rounded-aliases:
  sm: 'control'
  md: 'control'
  lg: 'control'
  xl: 'calc(0.25rem + 4px)'
shadows:
  card: '0 1px 0 oklch(100% 0 0 / 0.04), 0 12px 32px oklch(0% 0 0 / 0.18)'
  floating: '0 1px 0 oklch(100% 0 0 / 0.05), 0 18px 44px oklch(0% 0 0 / 0.28)'
shadow-aliases:
  sm: 'floating'
  md: 'floating'
  lg: 'floating'
layout:
  gutter: 'clamp(16px, 4vw, 32px)'
  section-gap: 'clamp(20px, 4vw, 40px)'
  feed-max: '720px'
  form-max: '720px'
  app-wide-max: '1180px'
  detail-max: '1040px'
  profile-max: '1280px'
  public-max: '1184px'
  sidebar-width: '220px'
  right-rail-width: '280px'
  mobile-tab-height: 'calc(72px + env(safe-area-inset-bottom))'
# One lightness and chroma per categorical palette; hues live in code.
categorical:
  lang-l: '72%'
  lang-c: 0.13
  status-l: '80%'
  status-c: 0.1
---

# Design System: Locatic

The front matter above is generated from `src/styles.css` by `scripts/generate-design-tokens.mjs` (`pnpm design:tokens`); `pnpm check` fails when it drifts. This prose explains how the tokens are meant to be used. When prose and code disagree, `src/styles.css` and the components in `src/components/ui/` win; fix the prose.

## 1. Overview

**Creative north star: "the terminal room with a city view."**

Locatic is built for developers who live in the dark, read in monospace and distrust polish. Screens are dense without being cramped: information first, decoration never. Place is the second register: city labels are links, city pages carry real counts, and there is one map surface.

- Dark only. There is no light mode and no `prefers-color-scheme: light` override.
- Three accent themes (teal, the default, violet and amber) swap only the accent family. Neutrals, place, status colours and text roles are shared, and every theme passes the contrast matrix.
- IBM Plex Mono carries product UI (navigation, labels, buttons, counts, timestamps). IBM Plex Sans is for human-written content (bios, descriptions, READMEs, comments, posts).
- Tabular numerals for every count and timestamp.
- Card-and-feed layout with a sidebar on desktop; bottom tab bar on mobile.

The design system rejects generic SaaS dark mode (neon accents, gradient cards, glass panels), LinkedIn-style networking UI (endorsements, completion meters) and GitHub's Primer look (green contribution palette, white surfaces).

## 2. Colour

### Surfaces

Five opaque steps, each at least 4 lightness points above the last so hover and selected states stay visible: `canvas` (page) < `surface-chrome` (sidebar, tab bar) < `surface` (cards, panels) < `surface-alt` (hover, inset) < `surface-raised` (active rows, badges). All neutrals share hue 230 at low chroma; never use a pure grey.

### Text

Three roles, each clearing 4.5:1 on every surface, including the translucent selected and hover washes: `text` (primary), `text-muted` (body and secondary metadata), `text-faint` (tertiary metadata, placeholders, icons at rest). `--lx-text-disabled` is for inactive controls only and has no utility; it is exempt from text contrast.

### Borders

- `line`: decorative dividers and card borders. Never the only sign of a state.
- `control`: field and switch borders, 3:1 against the canvas.
- `line-strong`: hover and emphasis borders.

### Accent

`brand` is the theme accent. It marks engaged state: the primary button, the active nav icon and bar, the selected-row bar, focus rings, engaged like and follow. Keep it to a small share of any screen; a container that "needs colour" gets `surface-alt`, not the accent. `brand-quiet` is the accent at 14% for tinted chips. `brand-2` (the secondary accent) is for section signatures only, never primary actions.

### Place

`place` (warm amber, constant across themes) is the location register. `place-quiet` is its tinted fill. Today it colours the Explore header's scope status; city pills stay neutral (`surface-alt` with `text-muted`) and signal place through the pin icon and the link to the city page.

### State layers

- Hover: `state-hover` (the same value as `surface-alt`). Decorative, so it needs no contrast.
- Selected: a `selected` fill (accent at 16%) plus a 2px `selected-bar`. The bar is the indicator; the fill only supports it. The city combobox's active option uses this pair.
- Focus: `focus`, the solid accent. The global rule is `:focus-visible { outline: 2px solid var(--lx-focus); outline-offset: 2px }`, never translucent and never offset 0. Rows clipped by a rounded container (feed sheets, notification rows) use an inset 2px ring instead.
- Unread: `unread`, a small accent-hued dot.
- Outgoing message bubble: `outgoing`.

### Semantic

`danger` for destructive confirmations and errors, `success` and `warning` for status. `liked` is the like/heart colour. The categorical palettes (language dots, build-status pills) use one lightness and chroma for every hue (`categorical` in the front matter); the hues live in `lang-dot.tsx` and `status-pill.tsx`.

### shadcn names

The stock utilities (`bg-background`, `bg-muted`, `text-muted-foreground`, `bg-primary`) still resolve to the same variables (see `shadcn-aliases`). New code uses the Locatic names.

### Contrast gate

`scripts/check-contrast.mjs` (part of `pnpm check`) builds its pairs from a role table for all three themes: every text role at 4.5:1 on every surface, every indicator (control border, strong border, focus, selected bar, unread dot) at 3:1, and labels on fills at 4.5:1. It fails when a new `--lx-*` colour token has no declared role.

## 3. Themes

`<html data-theme="teal|violet|amber">` is set by next-themes (`attribute="data-theme"` in `src/routes/__root.tsx`; ids in `src/lib/theme.ts`). Each `[data-theme]` block in `styles.css` overrides only `--lx-accent-l/c/h` and the secondary accent, so every derived token (quiet washes, selected fill, focus, unread dot, outgoing bubble) follows automatically.

- The theme picker scopes `data-theme` to each swatch, so a swatch shows its own accent rather than the active one.
- The logo is inline SVG painted with `currentColor` (`text-brand`), so it follows the theme. `public/favicon.svg` and `public/logo.svg` are static teal exports.
- The browser `theme-color` is a fixed near-black matching the canvas (`#06090a` in `__root.tsx`), not the accent.
- Toasts use Sonner with `theme="dark"` whatever the accent.

## 4. Typography

Fonts are self-hosted (latin subset, upright only) from `public/fonts/`: Plex Mono 400/500/600/700 and Plex Sans 400/500/600. Mono 400/600 and Sans 400 are preloaded in `__root.tsx`. Each family falls back to a metric-matched local font (`IBM Plex Mono Fallback`, `IBM Plex Sans Fallback`) so the swap does not reflow text. There is no italic and no Google Fonts request.

Six roles, as Tailwind utilities (`text-display` … `text-meta`), each carrying size, line height and, where set, weight and tracking:

| Role       | Size                   | Use                                                                                               |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `display`  | clamp(28px, 4vw, 40px) | Identity and project names on profile and project pages. Mono, 700.                               |
| `headline` | 22px                   | Page titles (`PageHeader`) on Home, Explore, Inbox, Notifications, Settings. Mono, 600.           |
| `title`    | 15px                   | Card and section titles. Mono, 600.                                                               |
| `body`     | 14px                   | Human-written text. Sans. Prose (READMEs) at about 72ch.                                          |
| `label`    | 12px                   | Buttons, metadata rows, primary timestamps and counts. Mono, tabular.                             |
| `meta`     | 11px                   | Badges, tab-bar labels, secondary metadata. Mono, tabular. The floor: no visible text below 11px. |

Inputs are 16px on touch viewports (`max-md:text-base` in `Input`) so iOS does not zoom on focus, and 14px from `md` up.

Rules:

- **Mono speaks for the product; Sans speaks for the user.** Never Sans in navigation, buttons, labels, counts or timestamps.
- **Tabular numerals** on every count and timestamp, so updates do not shift layout.
- **Lowercase by default** for product labels, navigation and buttons. Proper nouns (city and project names) keep their case.
- New arbitrary font sizes are reported by `pnpm check:arbitrary` (`scripts/check-arbitrary-values.mjs`) against an allowlist.

## 5. Shape and elevation

Radii: `rounded-control` (4px) for buttons, inputs and status pills; `rounded-card` (6px) for cards, panels and popovers; `rounded-pill` for city pills, badges and indicators. The stock `rounded-sm|md|lg` steps render as `control` (see `rounded-aliases`), and `cn()` (tailwind-merge configured in `src/lib/utils.ts`) resolves conflicts between them.

Elevation is earned by state. Surfaces are flat at rest (a clickable card has a 1px inner top highlight and nothing else):

- `shadow-card`: on the hover of a clickable card (`.lx-card`), only on pointer devices (`@media (hover: hover)`), with the border stepping to `line-strong` and a faint accent wash.
- `shadow-floating`: overlays (dialogs, popovers, dropdowns, the city listbox, tooltips). The stock `shadow-sm|md|lg` steps render as `floating`.

There are exactly two shadows. Do not add blur glows or intermediate values.

## 6. Motion

Overlay enter and exit animations (dialog, popover, tooltip, dropdown) come from `tw-animate-css` and stop under reduced motion (`motion-reduce:animate-none`). Skeletons pulse with `motion-safe:animate-pulse`. The CSS keyframes in `styles.css` (landing hero entrance, reaction pop and burst, fade-up) are all switched off under `prefers-reduced-motion: reduce`, as is the map ping. Nav indicators slide with a spring from `src/lib/motion.ts`; route chunks import motion features through `src/lib/motion-features.ts`.

## 7. Components

### Buttons (`src/components/ui/button.tsx`)

Mono label text, `rounded-control`, no resting shadow, focus from the global rule. Disabled buttons drop to 50% opacity and ignore the pointer.

| Variant               | Look                                          | Use                                                                             |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| `primary`             | brand fill, dark label, semibold              | The one main action on a surface: post, reply, save, finish onboarding.         |
| `secondary` (default) | `control` border, muted text                  | Follow, message, edit, cancel, and entry points to destructive flows.           |
| `ghost`               | no border, faint text, `state-hover` on hover | Mark read, inline and toolbar actions.                                          |
| `danger`              | danger fill, dark label, semibold             | Only the confirming step of a destructive action (delete account, delete post). |

| Size           | Height                                                       |
| -------------- | ------------------------------------------------------------ |
| `sm`           | 28px                                                         |
| `meta`         | 32px                                                         |
| `md` (default) | 36px                                                         |
| `icon`         | 32px square                                                  |
| `touch`        | at least 44px; the mobile shell and full-width touch actions |

`asChild` renders a single child (for example a router `Link`) with button styling.

### Cards (`card.tsx`, `card-sheet.tsx`)

`Card` is the one container: `rounded-card border border-line bg-surface`, densities `cozy`, `compact` (default) and `flush`, and `interactive` for clickable cards (adds `.lx-card`). `CardSheet` is a bordered list whose rows are divided by hairlines with no gaps; rows inside it are frameless and use an inset focus ring. Cards are never nested.

### Project card (`project-card.tsx`)

Order: project name (a link stretched over the card: the one tab stop that opens the project), description (clamped), builder with avatar, city pill and collaboration status pill, then the latest meaningful update ("released v1.2 · 3d ago", "posted · 2h ago", "pushed · 5d ago") and a secondary metadata line with the language bar. Zero counts are hidden, except the comment action, which reads "start the conversation" at zero. Visitors see sync freshness ("updated 3d ago", "no README"); a failed refresh and its retry control reach the owner only. Every other control (like, save, comment, dismiss) sits above the stretched link as its own target. In a selected city, Explore lists the viewer's own projects last under a "yours" label (`explore-feed.tsx`).

### Inputs (`input.tsx`, `textarea.tsx`)

`control` border, `canvas` fill, `rounded-control`, mono text, `text-faint` placeholder. Focus uses the global outline; the border does not change. 16px on touch, 14px from `md`. Search inputs carry a 14px search icon on the left.

### City combobox (`city-combobox.tsx`)

An editable combobox: `role="combobox"` input, `role="listbox"` popup (`shadow-floating`, at least 320px wide from `md`, scrolls at `max-h-72`), `role="option"` rows at least 44px tall. Focus stays on the input while `aria-activedescendant` names the active option, which shows the selected fill and bar. Arrow keys move, Enter selects, Escape and blur close. With a query and no rows the popup says "searching…" or "no cities match". Ranking rules are in `convex/lib/citySearch.ts` and `docs/explore-home-logic.md`.

### City pill (`city-pill.tsx`)

Renders the server's location disclosure: an exact city is a link to its city page (`/c/{cityId}`, which redirects to the slug), a region-only label is plain text, and a hidden location renders nothing. `rounded-pill`, `line` border, `surface-alt` fill, `text-muted` meta text, a map-pin icon. The removable variant (Explore chips) has a 44px remove target that overhangs the pill.

### Status pill (`status-pill.tsx`)

`rounded-control`, a hue per build status at the shared `--lx-status-l/c` lightness and chroma, `color-mix` fill and border. `just exploring` is muted. Project cards and builder rows show only the collaboration statuses (open to collab, looking for cofounder, hiring).

### Sidebar (desktop)

220px wide (76px collapsed), `surface-chrome` background, `line` right border. The active item has a 2px accent bar on its left edge and an accent icon; labels are mono `label` size, lowercase. Collapsed items get tooltips.

### Mobile tab bar

Fixed to the bottom, `surface-chrome` with a `line` top border, height `calc(72px + env(safe-area-inset-bottom))`. Tabs follow the sidebar order (home, explore, inbox, notifications, profile) with short labels that fit ("alerts" for notifications). The active tab has a 24px accent pill above its icon. Every tab is at least 44px tall.

### Unread badges (decision D4)

Readable and quiet: `surface-raised` fill, `text` count at `meta` size, tabular, `rounded-pill`, capped at "99+". Hidden at zero. The badge is `aria-hidden`; the link's accessible name carries the count ("notifications, 3 unread"). Badges never use the accent fill, so they do not compete with primary actions. The inbox badge counts messages; the notifications badge excludes direct messages, so one message is never two tasks. This supersedes the quieted badges of `docs/plans/2026-07-05-ui-consistency-and-pr18-landing-plan.md`.

### Notification rows

Full-width buttons: 36px avatar with a type icon, actor name in mono semibold, action text in Sans, timestamp in `meta`. Unread rows have primary text, an `unread` dot and a screen-reader "unread:" prefix; read rows use muted text. Hover is `surface-raised`; focus is an inset accent ring. Opening a row marks it read and navigates in one action.

### Toasts

One Sonner `Toaster` (bottom centre, dark theme), loaded lazily by the root document. Toasts are for brief action failures and undo (unfollow, unpin, unsave) through `src/lib/action-error.ts` and `src/lib/undo-toast.ts`. Form errors stay inline and keep the input; failed sections show a persistent recovery block.

### Empty states (`empty-state.tsx`)

A title that names the situation (the city, the interval), a sentence of explanation, one primary action that changes the outcome and at most one secondary action. Loading, empty, error and "nothing in the last 30 days" are distinct states.

## 8. Do and don't

Do:

- Use the semantic utilities (`bg-surface`, `text-text-muted`, `border-control`, `rounded-card`, `shadow-floating`) rather than `var(--lx-*)` in class strings or inline styles. Inline styles are for genuinely dynamic values.
- Keep touch targets at least 44px in the mobile shell.
- Commit actions optimistically and report failures honestly (a toast with the reason, or inline for forms).
- Put filter state in the URL (`validateSearch`) so it survives reloads and can be shared.
- Close a dialog before (or together with) navigating from it.

Don't:

- Add a light mode or theme-dependent neutrals.
- Use glassmorphism, gradient text, or a coloured border-left stripe wider than 1px as decoration.
- Show numbered ranks, match percentages or "recommended" badges; discovery order is explained in words ("most recent public work first").
- Render the same action twice on one screen (one like button on the project page).
- Use `style={{}}` for layout, or arbitrary font sizes, radii, shadows and hex colours in `src/features` and `src/routes`.
- Use `as never` on router calls; the router is registered for typed params and search.
