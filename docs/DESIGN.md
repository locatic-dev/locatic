---
# Generated from src/styles.css by scripts/generate-design-tokens.mjs.
# Do not edit by hand: run `pnpm design:tokens`. `pnpm check` runs
# `pnpm design:tokens:check`, which fails when this block drifts.
name: Locatic
description: 'GitHub with a map — developer discovery platform built around location.'
# Tailwind colour utilities (bg-*, text-*, border-*), default theme.
colors:
  canvas: 'oklch(14.5% 0.003 250)'
  surface-chrome: 'oklch(16.5% 0.003 250)'
  surface: 'oklch(19% 0.004 250)'
  surface-alt: 'oklch(23% 0.004 250)'
  surface-raised: 'oklch(27% 0.005 250)'
  line: 'oklch(29% 0.004 250)'
  line-strong: 'oklch(58% 0.004 250)'
  control: 'oklch(57% 0.004 250)'
  text: 'oklch(94% 0.003 250)'
  text-muted: 'oklch(72% 0.004 250)'
  brand: 'oklch(76% 0.17 195)'
  brand-quiet: 'oklch(76% 0.17 195 / 0.14)'
  brand-foreground: 'oklch(14% 0.003 250)'
  brand-2: 'oklch(74% 0.11 300)'
  brand-2-quiet: 'oklch(74% 0.11 300 / 0.12)'
  selected: 'oklch(76% 0.17 195 / 0.16)'
  selected-bar: 'oklch(76% 0.17 195)'
  state-hover: 'oklch(23% 0.004 250)'
  focus: 'oklch(76% 0.17 195)'
  outgoing: 'oklch(76% 0.17 195 / 0.16)'
  unread: 'oklch(70% 0.1 195)'
  liked: 'oklch(69% 0.19 25)'
  success: 'oklch(70% 0.16 145)'
  live: 'oklch(76% 0.17 150)'
  warning: 'oklch(72% 0.18 75)'
  danger: 'oklch(69% 0.19 25)'
  place: 'oklch(78% 0.14 65)'
  place-quiet: 'oklch(78% 0.14 65 / 0.14)'
# Stock shadcn utilities: the Locatic colour they share, else their value.
shadcn-aliases:
  background: 'canvas'
  foreground: 'text'
  card: 'surface'
  card-foreground: 'oklch(94% 0.003 250)'
  popover: 'surface'
  popover-foreground: 'oklch(94% 0.003 250)'
  primary: 'brand'
  primary-foreground: 'brand-foreground'
  secondary: 'surface-alt'
  secondary-foreground: 'oklch(94% 0.003 250)'
  muted: 'surface-alt'
  muted-foreground: 'text-muted'
  accent: 'surface-alt'
  accent-foreground: 'oklch(94% 0.003 250)'
  destructive: 'danger'
  destructive-foreground: 'oklch(14% 0.003 250)'
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
    accent: 'oklch(76% 0.17 195)'
    accent-2: 'oklch(74% 0.11 300)'
  violet:
    accent: 'oklch(76% 0.17 292)'
    accent-2: 'oklch(75% 0.11 195)'
  amber:
    accent: 'oklch(78% 0.16 75)'
    accent-2: 'oklch(72% 0.11 210)'
fonts:
  sans: "'Geist', 'Geist Fallback', 'Geist Fallback Roboto', ui-sans-serif, system-ui, sans-serif"
  mono: "'Geist Mono', 'Geist Mono Fallback', 'Geist Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
  self-hosted:
    Geist: '400 600'
    'Geist Mono': '400 600'
# Type roles: Tailwind text-<role> utilities.
typography:
  hero:
    fontFamily: "'Geist', 'Geist Fallback', 'Geist Fallback Roboto', ui-sans-serif, system-ui, sans-serif"
    fontSize: 'clamp(44px, 8vw, 72px)'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '-0.04em'
  display:
    fontFamily: "'Geist', 'Geist Fallback', 'Geist Fallback Roboto', ui-sans-serif, system-ui, sans-serif"
    fontSize: 'clamp(28px, 4vw, 40px)'
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: '-0.03em'
  headline:
    fontFamily: "'Geist', 'Geist Fallback', 'Geist Fallback Roboto', ui-sans-serif, system-ui, sans-serif"
    fontSize: '22px'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '-0.02em'
  title:
    fontFamily: "'Geist', 'Geist Fallback', 'Geist Fallback Roboto', ui-sans-serif, system-ui, sans-serif"
    fontSize: '16px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.01em'
  body:
    fontFamily: "'Geist', 'Geist Fallback', 'Geist Fallback Roboto', ui-sans-serif, system-ui, sans-serif"
    fontSize: '15px'
    lineHeight: 1.6
  label:
    fontFamily: "'Geist Mono', 'Geist Mono Fallback', 'Geist Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '12px'
    lineHeight: 1.4
    fontVariantNumeric: 'tabular-nums'
  meta:
    fontFamily: "'Geist Mono', 'Geist Mono Fallback', 'Geist Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '11px'
    lineHeight: 1.4
    fontVariantNumeric: 'tabular-nums'
  eyebrow:
    fontFamily: "'Geist Mono', 'Geist Mono Fallback', 'Geist Mono Fallback Courier', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '11px'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: '0.06em'
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
  right-rail-width: '300px'
  mobile-tab-height: 'calc(72px + env(safe-area-inset-bottom))'
# One lightness and chroma per categorical palette; hues live in code.
categorical:
  lang-l: '72%'
  lang-c: 0.15
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
- Geist (sans) carries names, titles, headings and human-written content (bios, descriptions, READMEs, comments, posts). Geist Mono carries metadata: navigation, labels, buttons, counts, timestamps, code and uppercase eyebrows.
- Tabular numerals for every count and timestamp.
- Card-and-feed layout with a sidebar on desktop; bottom tab bar on mobile.

The design system rejects generic SaaS dark mode (neon accents, gradient cards, glass panels), LinkedIn-style networking UI (endorsements, completion meters) and GitHub's Primer look (green contribution palette, white surfaces).

## 2. Colour

### Surfaces

Five opaque steps on a near-black canvas (`#090a0b`); the steps a hover or selection crosses (`surface` to `surface-alt` to `surface-raised`) are 4 lightness points apart so those states stay visible: `canvas` (page) < `surface-chrome` (sidebar, tab bar) < `surface` (cards, panels) < `surface-alt` (hover, inset) < `surface-raised` (active rows, badges). All neutrals share hue 250 at near-zero chroma (0.003 to 0.005): neutral, not slate, and never a pure grey. Cards separate from the page by their 1px `line` hairline rather than by fill.

### Text

Two roles, each clearing 4.5:1 on every surface, including the translucent selected wash and outgoing bubble: `text` for names, titles and descriptions, and `text-muted`, the one metadata grey (secondary text, metadata, placeholders, icons at rest). There is no third tier. `--lx-text-disabled` is for inactive controls only and has no utility; it is exempt from text contrast.

### Borders

- `line`: decorative dividers and card borders. Never the only sign of a state.
- `control`: field and switch borders, 3:1 against the canvas.
- `line-strong`: hover and emphasis borders.

### Accent

`brand` is the theme accent, and it is used solid: the primary button, the active nav icon and bar, the active tab underline, the selected-row bar, focus rings, the viewer's own reaction (border and count), the unfollowed `follow` action and the 2px hover edge of a clickable card. Keep it to a small share of any screen; a container that "needs colour" gets `surface-alt`, not the accent. Tints (`brand-quiet`, `selected`) are for hover and selected backgrounds only; a meaningful state is a solid border or text colour, never a tinted fill. `brand-2` (the secondary accent) is for section signatures only, never primary actions.

### Place

`place` (amber, constant across themes) is the location signature: every location reference is `text-place`, including city pills (label and pin) and the Explore header's scope status. `place-quiet` is its tinted fill, for hover and selected backgrounds only.

### Live

`live` (green, constant across themes) means "active in the last 24 hours": an avatar ring and a small dot. It is an indicator, held to 3:1 on every surface, never text.

### State layers

- Hover: `state-hover` (the same value as `surface-alt`). Decorative, so it needs no contrast.
- Selected: a `selected` fill (accent at 16%) plus a 2px `selected-bar`. The bar is the indicator; the fill only supports it. The city combobox's active option uses this pair.
- Focus: `focus`, the solid accent. The global rule is `:focus-visible { outline: 2px solid var(--lx-focus); outline-offset: 2px }`, never translucent and never offset 0. Rows clipped by a rounded container (feed sheets, notification rows) use an inset 2px ring instead.
- Unread: `unread`, a small accent-hued dot.
- Card hover: `surface-alt` fill plus a 2px inset accent edge on the left (`.lx-card`, pointer devices only).
- Outgoing message bubble: `outgoing`.

### Semantic

`danger` for destructive confirmations and errors, `success` and `warning` for status. `liked` is the like/heart colour. The categorical palettes (language dots, build-status pills) use one lightness and chroma for every hue (`categorical` in the front matter); the hues live in `lang-dot.tsx` (GitHub linguist hues) and `status-pill.tsx`.

### shadcn names

The stock utilities (`bg-background`, `bg-muted`, `text-muted-foreground`, `bg-primary`) still resolve to the same variables (see `shadcn-aliases`). New code uses the Locatic names.

### Contrast gate

`scripts/check-contrast.mjs` (part of `pnpm check`) builds its pairs from a role table for all three themes: every text role at 4.5:1 on every surface, every indicator (control border, strong border, focus, selected bar, unread dot, live) at 3:1, and labels on fills at 4.5:1. It fails when a new `--lx-*` colour token has no declared role.

## 3. Themes

`<html data-theme="teal|violet|amber">` is set by next-themes (`attribute="data-theme"` in `src/routes/__root.tsx`; ids in `src/lib/theme.ts`). Each `[data-theme]` block in `styles.css` overrides only `--lx-accent-l/c/h` and the secondary accent, so every derived token (quiet washes, selected fill, focus, unread dot, outgoing bubble) follows automatically.

- The theme picker scopes `data-theme` to each swatch, so a swatch shows its own accent rather than the active one.
- The logo is inline SVG painted with `currentColor` (`text-brand`), so it follows the theme. `public/favicon.svg` and `public/logo.svg` are static teal exports.
- The browser `theme-color` is a fixed near-black matching the canvas (`#090a0b` in `__root.tsx`, `public/manifest.json` and the `public/favicon.svg` background), not the accent. `src/lib/__tests__/theme-browser-colour.test.ts` keeps the copies in step. The raster icons (`favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-*.png`) and the social preview `og-image.png` are generated from `favicon.svg` and the tokens by `pnpm brand:images` (`scripts/generate-brand-images.mjs`); rerun it after changing the mark or the canvas colour.
- Toasts use Sonner with `theme="dark"` whatever the accent.

## 4. Typography

Fonts are self-hosted (latin subset, upright only, OFL in `public/fonts/OFL.txt`) from `public/fonts/`: one variable file each for Geist and Geist Mono, declared for weights 400 to 600. Both files are preloaded in `__root.tsx`. `font-synthesis-weight: none` on `html` stops the browser faking a heavier weight, so `font-bold` renders at 600. Each family falls back to a metric-matched local font (`Geist Fallback` on Arial or Roboto, `Geist Mono Fallback` on Menlo or Courier New) so the swap does not reflow text. There is no italic and no Google Fonts request.

Eight roles, as Tailwind utilities (`text-hero` … `text-eyebrow`), each carrying size, line height and, where set, weight and tracking:

| Role       | Size                   | Use                                                                                               |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `hero`     | clamp(44px, 8vw, 72px) | The landing headline only. Sans, 600, -0.04em.                                                    |
| `display`  | clamp(28px, 4vw, 40px) | Identity and project names on profile and project pages. Sans, 600, -0.03em.                      |
| `headline` | 22px                   | Page titles (`PageHeader`) on Home, Explore, Inbox, Notifications, Settings. Sans, 600.           |
| `title`    | 16px                   | Card and section titles, repo names. Sans, 600.                                                   |
| `body`     | 15px                   | Human-written text. Sans. Prose (READMEs) at about 72ch.                                          |
| `label`    | 12px                   | Buttons, metadata rows, primary timestamps and counts. Mono, tabular.                             |
| `meta`     | 11px                   | Badges, tab-bar labels, secondary metadata. Mono, tabular. The floor: no visible text below 11px. |
| `eyebrow`  | 11px                   | Section headers and metadata micro-labels. Mono, 500, uppercase, 0.06em tracking.                 |

Inputs are 16px on touch viewports (`max-md:text-base` in `Input`) so iOS does not zoom on focus, and 15px from `md` up.

Rules:

- **Sans names things; Mono measures them.** Names, titles, headings and user content are Sans (a person's name is `font-sans text-label font-medium` in rows). Metadata, counts, timestamps, code, buttons and navigation are Mono, and section headers are `text-eyebrow`. Never Sans for a count or timestamp.
- **Tabular numerals** on every count and timestamp, so updates do not shift layout.
- **Lowercase by default** for product labels, navigation and buttons; uppercase only through `text-eyebrow`. Proper nouns (city and project names) and user content keep their case.
- New arbitrary font sizes are reported by `pnpm check:arbitrary` (`scripts/check-arbitrary-values.mjs`) against an allowlist.

## 5. Shape and elevation

Radii: `rounded-control` (4px) for buttons, inputs and status pills; `rounded-card` (6px) for cards, panels and popovers; `rounded-pill` for city pills, badges and indicators. The stock `rounded-sm|md|lg` steps render as `control` (see `rounded-aliases`), and `cn()` (tailwind-merge configured in `src/lib/utils.ts`) resolves conflicts between them.

Elevation is earned by state. Surfaces are flat at rest and separate by their hairline border. A clickable card (`.lx-card`) lifts on hover, on pointer devices only (`@media (hover: hover)`): its fill steps to `surface-alt` and a 2px inset accent edge appears on the left. It casts no shadow.

- `shadow-card`: static panels that sit alone on the canvas (the root error page, sign-in card, settings panels, route skeletons).
- `shadow-floating`: overlays (dialogs, popovers, dropdowns, the city listbox, tooltips). The stock `shadow-sm|md|lg` steps render as `floating`.

There are exactly two shadows. Do not add blur glows or intermediate values.

## 6. Motion

Overlay enter and exit animations (dialog, popover, tooltip, dropdown) come from `tw-animate-css` and stop under reduced motion (`motion-reduce:animate-none`). Skeletons pulse with `motion-safe:animate-pulse`. The CSS keyframes in `styles.css` (landing hero entrance, reaction pop and burst, fade-up) are all switched off under `prefers-reduced-motion: reduce`, as are the 404 map ping and the landing globe. Nav indicators slide with a spring from `src/lib/motion.ts`; route chunks import motion features through `src/lib/motion-features.ts`. The landing `PingGlobe` is the one ambient animation: a canvas dot-matrix globe (Natural Earth land, generated by `pnpm geo:land-dots`) drifts eastward at a few degrees a second; every 2.5s one city turns accent, emits a ring and shows a card for 2s, and when the card closes the globe eases round (a critically damped spring, no extra motion code) to the next city. Dot colours come from `--lx-text-2` and `--lx-text`, re-read when the theme changes. It pauses while the tab is hidden or the globe is off screen, and has a pause control at its bottom-right corner. Under reduced motion it is a still frame facing the first city, with three pinged cities.

## 7. Components

### Buttons (`src/components/ui/button.tsx`)

Mono label text, `rounded-control`, no resting shadow, focus from the global rule. Disabled buttons drop to 50% opacity and ignore the pointer.

| Variant               | Look                                          | Use                                                                             |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| `primary`             | brand fill, dark label, semibold              | The one main action on a surface: post, reply, save, finish onboarding.         |
| `secondary` (default) | `control` border, muted text                  | Follow, message, edit, cancel, and entry points to destructive flows.           |
| `ghost`               | no border, muted text, `state-hover` on hover | Mark read, inline and toolbar actions.                                          |
| `danger`              | danger fill, dark label, semibold             | Only the confirming step of a destructive action (delete account, delete post). |

| Size           | Height                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `sm`           | 28px                                                                                                                   |
| `meta`         | 32px                                                                                                                   |
| `md` (default) | 36px                                                                                                                   |
| `icon`         | 32px square                                                                                                            |
| `touch`        | 32px with a mouse, at least 44px on coarse pointers (`pointer-coarse:`); the mobile shell and full-width touch actions |

`asChild` renders a single child (for example a router `Link`) with button styling.

### Cards (`card.tsx`, `card-sheet.tsx`)

`Card` is the one container: `rounded-card border border-line bg-surface`, densities `cozy`, `compact` (default) and `flush`, and `interactive` for clickable cards (adds `.lx-card`). `CardSheet` is a bordered list whose rows are divided by hairlines with no gaps; rows inside it are frameless and use an inset focus ring. Cards are never nested.

### Project card (`project-card.tsx`)

Top to bottom:

1. **Identity line.** The builder's 32px avatar (with the live ring) and name, linked to their profile; the collaboration status pill when the builder is open to collab, looking for a cofounder or hiring; then one `CITY · AGE` group in mono eyebrow text: the city (an inline city link in `place`) and the relative age of the latest meaningful update. The age's screen-reader prefix and title say what happened ("released v1.2 · ", "posted · ", "pushed · "). On a narrow card (container below `xl`) the group takes its own line under the name and drops its leading dot.
2. **Title.** `owner/repo` in `title` type, a link stretched over the card: the one tab stop that opens the project.
3. **Description**, clamped to two lines (one when `compact`).
4. **Metadata line** in mono: the primary language dot and name, GitHub stars, forks, up to three `#topics` and the post count. Zero counts are hidden.
5. **Footer.** Reaction pills and the comment link on the left ("start the conversation" at zero comments); on the right, follow and save. Follow is solid `primary` until the viewer follows the builder, then a quiet `ghost` "following"; save is `ghost` with a bookmark that fills once saved. Visitors on Explore get one sign-in link ("sign in to react, follow or save") in place of follow and save, and their reaction pills fade only the disabled reacting half: counts keep full contrast and still open the reactor list. Cards carry no message action; messaging starts from the profile or the project page.

Every control other than the title (author, city, reactions, comment, follow, save, dismiss) sits above the stretched link as its own target. Visitors also see sync freshness ("updated 3d ago", "no README"); a failed refresh and its retry control reach the owner only. In a selected city, Explore lists the viewer's own projects last under a "yours" label (`explore-feed.tsx`).

- **Variants.** `card` (default) is a framed card whose footer sits above a hairline. `row` is frameless, for a list inside `cardSheetClass`, whose hairlines separate the rows: its footer has no divider, and it leaves sync freshness to the project page (the age stays in the identity line).
- **Author placement.** `header` (default) puts the identity line first; `footer` moves it into the footer, where the age moves to its own line under the description; `none` drops it for lists where every card has the same author (profiles).
- **Live ring.** When the latest update is under 24 hours old (`isLive`), the builder's avatar gets a `live` ring (titled "active in the last 24h"). Ages and the ring depend on the clock, so they appear only after hydration, in space reserved for them.

### Inputs (`input.tsx`, `textarea.tsx`, `native-select.tsx`)

`control` border, `canvas` fill, `rounded-control`, mono text, `text-muted` placeholder. Focus uses the global outline; the border does not change. 16px on touch, 15px from `md`. Search inputs carry a 14px search icon on the left. Selects stay native (`NativeSelect`): the browser arrow is replaced by a 16px chevron 12px from the edge, with the text kept clear of it; forced-colors mode gets the native arrow back. They use the compact label size (12px) from `md` up, 16px on touch, and are 44px tall on coarse pointers.

Dialogs (`dialog.tsx`) are never taller than the viewport less a 16px gutter; longer content scrolls inside the dialog.

### City combobox (`city-combobox.tsx`)

An editable combobox: `role="combobox"` input, `role="listbox"` popup (`shadow-floating`, at least 320px wide from `md`, scrolls at `max-h-72`), `role="option"` rows at least 44px tall. Focus stays on the input while `aria-activedescendant` names the active option, which shows the selected fill and bar. Arrow keys move, Enter selects, Escape and blur close. With a query and no rows the popup says "searching…" or "no cities match". Ranking rules are in `convex/lib/citySearch.ts` and `docs/explore-home-logic.md`.

### City pill (`city-pill.tsx`)

Renders the server's location disclosure: an exact city is a link to its city page (`/c/{cityId}`, which redirects to the slug), a region-only label is plain text, and a hidden location renders nothing. `rounded-pill`, `line` border, `surface-alt` fill, `text-place` meta text and map-pin icon. The `inline` variant is bare mono eyebrow text in `place`, for identity lines; linked, it is at least 24px tall with a mouse and 44px on coarse pointers, its text centred. The removable variant (Explore chips) has a 24px remove target with a mouse; on coarse pointers it grows to 44px and overhangs the pill. Explore's filter chips follow the same pattern.

### Status pill (`status-pill.tsx`)

`rounded-control`, a hue per build status at the shared `--lx-status-l/c` lightness and chroma, `color-mix` fill and border. `just exploring` is muted. Project cards and builder rows show only the collaboration statuses (open to collab, looking for cofounder, hiring).

### Sidebar (desktop)

220px wide (76px collapsed), `surface-chrome` background, `line` right border. The active item has a 2px accent bar on its left edge and an accent icon; labels are mono `label` size, lowercase. Collapsed items get tooltips.

### Mobile tab bar

Fixed to the bottom, `surface-chrome` with a `line` top border, height `calc(72px + env(safe-area-inset-bottom))`. Tabs follow the sidebar order (home, explore, inbox, notifications, profile) with short labels that fit ("alerts" for notifications). The active tab has a 24px accent pill above its icon. Every tab is at least 44px tall.

### Unread badges

Readable and quiet: `surface-raised` fill, `text` count at `meta` size, tabular, `rounded-pill`, capped at "99+". Hidden at zero. The badge is `aria-hidden`; the link's accessible name carries the count ("notifications, 3 unread"). Badges never use the accent fill, so they do not compete with primary actions. The inbox badge counts messages; the notifications badge excludes direct messages, so one message is never two tasks.

### Notification rows

Full-width buttons: 36px avatar with a type icon, actor name in Sans 500, action text in Sans, timestamp in `meta`. Unread rows have primary text, an `unread` dot and a screen-reader "unread:" prefix; read rows use muted text. Hover is `surface-raised`; focus is an inset accent ring. Opening a row marks it read and navigates in one action.

### Toasts

One Sonner `Toaster` (bottom centre, dark theme), loaded lazily by the root document. Toasts are for brief action failures and undo (unfollow, unpin, unsave) through `src/lib/action-error.ts` and `src/lib/undo-toast.ts`. Form errors stay inline and keep the input; failed sections show a persistent recovery block.

### Empty states (`empty-state.tsx`)

A title that names the situation (the city, the interval), a sentence of explanation, one primary action that changes the outcome and at most one secondary action. Loading, empty, error and "nothing in the last 30 days" are distinct states.

## 8. Do and don't

Do:

- Use the semantic utilities (`bg-surface`, `text-text-muted`, `border-control`, `rounded-card`, `shadow-floating`) rather than `var(--lx-*)` in class strings or inline styles. Inline styles are for genuinely dynamic values.
- Keep touch targets at least 44px on coarse pointers (`pointer-coarse:`). With a mouse, controls are 24 to 32px.
- Commit actions optimistically and report failures honestly (a toast with the reason, or inline for forms).
- Put filter state in the URL (`validateSearch`) so it survives reloads and can be shared.
- Close a dialog before (or together with) navigating from it.

Don't:

- Add a light mode or theme-dependent neutrals.
- Use glassmorphism, gradient text, or a coloured border-left stripe wider than 1px as decoration. The 2px accent edge on a hovered card is an interaction state, not decoration, and is the one exception.
- Use a tinted fill to carry meaning (an active chip, an own reaction, a topic). Use a solid border or text colour; tints are for hover and selected backgrounds.
- Show numbered ranks, match percentages or "recommended" badges; discovery order is explained in words ("most recent public work first").
- Render the same action twice on one screen (one like button on the project page).
- Use `style={{}}` for layout, or arbitrary font sizes, radii, shadows and hex colours in `src/features` and `src/routes`.
- Use `as never` on router calls; the router is registered for typed params and search.
