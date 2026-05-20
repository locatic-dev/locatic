---
name: Locatic
description: 'GitHub with a map — developer discovery platform built around location.'
colors:
  brand: 'oklch(72% 0.17 185)'
  brand-quiet: 'oklch(72% 0.17 185 / 0.14)'
  canvas: 'oklch(13.5% 0.007 230)'
  surface: 'oklch(17.5% 0.007 230)'
  surface-alt: 'oklch(21% 0.007 230)'
  line: 'oklch(28% 0.007 230)'
  line-strong: 'oklch(40% 0.007 230)'
  text: 'oklch(93% 0.005 230)'
  text-muted: 'oklch(60% 0.005 230)'
  text-faint: 'oklch(43% 0.005 230)'
  danger: 'oklch(62% 0.22 25)'
  success: 'oklch(70% 0.16 145)'
  warning: 'oklch(72% 0.18 75)'
typography:
  display:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace"
    fontSize: 'clamp(28px, 4vw, 40px)'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.025em'
  headline:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '22px'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '-0.02em'
  title:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '14.5px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.01em'
  body:
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: '13.5px'
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 'normal'
  label:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '11px'
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 'normal'
  meta:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace"
    fontSize: '9.5px'
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: '0.02em'
rounded:
  control: '4px'
  card: '6px'
  pill: '999px'
spacing:
  gutter: 'clamp(16px, 4vw, 32px)'
  section-gap: 'clamp(20px, 4vw, 40px)'
  feed-max: '720px'
  detail-max: '1040px'
  sidebar: '220px'
components:
  button-brand:
    backgroundColor: '{colors.brand}'
    textColor: 'oklch(14% 0.005 230)'
    rounded: '{rounded.control}'
    padding: '6px 14px'
  button-brand-hover:
    backgroundColor: 'oklch(76% 0.17 185)'
    textColor: 'oklch(14% 0.005 230)'
    rounded: '{rounded.control}'
    padding: '6px 14px'
  button-outline:
    backgroundColor: 'transparent'
    textColor: '{colors.text-muted}'
    rounded: '{rounded.control}'
    padding: '6px 14px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.text-faint}'
    rounded: '{rounded.control}'
    padding: '6px 14px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.card}'
    padding: '18px 20px'
  input:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    padding: '8px 12px'
  city-pill:
    backgroundColor: '{colors.surface-alt}'
    textColor: '{colors.text-muted}'
    rounded: '{rounded.pill}'
    padding: '3px 8px'
  notification-badge:
    backgroundColor: '{colors.brand}'
    textColor: 'oklch(14% 0.005 230)'
    rounded: '{rounded.pill}'
    padding: '2px 4px'
---

# Design System: Locatic

## 1. Overview

**Creative North Star: "The Terminal Room with a City View"**

Locatic's design system is built for developers who live in the dark, read in monospace, and distrust polish. The interface is dense without being cramped, dark without being theatrical, and technical without being cold. Every screen operates at the density of a good CLI — information first, decoration never.

The single-theme dark palette is not a feature toggle. It is the product's identity. The canvas is deep near-black (`oklch(13.5% 0.007 230)`) with a trace of blue-indigo tint — just enough to separate it from neutral black without reading as "dark mode." IBM Plex Mono carries all product UI: nav labels, metadata, buttons, timestamps, counts. IBM Plex Sans enters only when content is human-written — bios, READMEs, comments. This typeface switch is the only register change in the system, and it is meaningful.

The brand accent — a muted teal at `oklch(72% 0.17 185)` — appears sparingly: active nav states, the like/follow CTA when engaged, badge counts, focus rings. Its restraint is the point. When it appears, it means something happened.

This system explicitly rejects: generic SaaS dark mode (neon accents, gradient cards, glassmorphism panels), LinkedIn's social-network density (connection badges, completion meters, algorithmic urgency), and GitHub's own Primer aesthetic (the green contribution graph palette, white surfaces, Primer component shapes).

**Key Characteristics:**

- Dark-only, single theme — no light mode, no conditional color scheme
- IBM Plex Mono as the dominant product voice; IBM Plex Sans for human content only
- Muted teal accent used at ≤10% of any screen surface
- Card-and-feed layout on desktop; bottom tab bar on mobile
- Tabular-nums throughout for count stability
- City identity surfaced in navigation, cards, and filter chips

## 2. Colors: The Indigo-Night Palette

A near-black canvas, slightly indigo-tinted neutrals, and one muted teal signal — enough to feel intentional without competing with code.

### Primary

- **Signal Teal** (`oklch(72% 0.17 185)`): the brand accent. Active nav bars, engaged like/follow buttons, focus outlines, badge backgrounds, branch/top indicators. Never decorative — only on interactive state or notification count.
- **Signal Teal Quiet** (`oklch(72% 0.17 185 / 0.14)`): tinted background for highlighted comment rows and subtle selected states. Never used as a border or foreground color.

### Neutral

- **Deep Indigo Canvas** (`oklch(13.5% 0.007 230)`): the page background. Not pure black — the faint indigo tint keeps it from reading as terminal-black.
- **Card Surface** (`oklch(17.5% 0.007 230)`): card and panel backgrounds. 4 lightness points above canvas — enough to separate without a visible shadow.
- **Alt Surface** (`oklch(21% 0.007 230)`): muted/secondary panel backgrounds, tab highlights, inline code blocks. Third tier.
- **Border Default** (`oklch(28% 0.007 230)`): all card borders, dividers, input strokes. The workhorse separator.
- **Border Strong** (`oklch(40% 0.007 230)`): emphasized dividers, scrollbar thumb, hover-active card borders.
- **Text Primary** (`oklch(93% 0.005 230)`): all primary readable text. Slightly cool-tinted off-white.
- **Text Muted** (`oklch(60% 0.005 230)`): secondary metadata, descriptions, author handles, timestamps.
- **Text Faint** (`oklch(43% 0.005 230)`): tertiary labels, placeholder text, hint copy, icon fills at rest.

### Semantic

- **Danger** (`oklch(62% 0.22 25)`): destructive action confirmation, error states.
- **Success** (`oklch(70% 0.16 145)`): positive confirmations, "shipping" build-status hue.
- **Warning** (`oklch(72% 0.18 75)`): recoverable warnings (GitHub sync failure toast, stale data notices).

### Named Rules

**The Dark Covenant.** There is no light mode. Never add `prefers-color-scheme: light` overrides, light theme classes, or conditional color sets. The dark palette is the product, not a preference.

**The Teal Scarcity Rule.** The brand teal appears on ≤10% of any given screen. It marks engaged state, not background decoration. If you find yourself reaching for teal on a container background, use Surface-Alt instead.

**The Tinted Neutral Rule.** All neutrals carry `hue 230` (blue-indigo) at `chroma 0.005–0.007`. Never use pure gray (`chroma 0`). The tint is invisible at first glance and prevents the palette from reading as generic dark mode.

## 3. Typography

**Display / UI Font:** IBM Plex Mono (with `ui-monospace, 'Cascadia Code', monospace` fallback)
**Body / Content Font:** IBM Plex Sans (with `ui-sans-serif, system-ui, sans-serif` fallback)

**Character:** IBM Plex Mono lends the UI a confident, authoritative terminal energy without feeling cold. It renders especially well at 11–14px — the density sweet spot for metadata. IBM Plex Sans softens the register exactly when human-authored content arrives: bios, descriptions, comments. The switch between the two is the system's primary hierarchy signal.

### Hierarchy

- **Display** (700 weight, `clamp(28px, 4vw, 40px)`, line-height 1.1, tracking -0.025em): page titles and project repo names on the detail page. Mono only.
- **Headline** (600 weight, 22px, line-height 1.3, tracking -0.02em): section headers, explore page title. Mono only.
- **Title** (600 weight, 14.5px, line-height 1.4, tracking -0.01em): card repo names, nav labels, profile display names. Mono only.
- **Body** (400 weight, 13.5px, line-height 1.6): project descriptions, bios, README content, comment text. Sans only. Max line length 65–75ch.
- **Label** (400 weight, 11–12px, line-height 1.4): metadata row text, stat labels, button text, city pills. Mono.
- **Meta** (400 weight, 9.5–10.5px, line-height 1.4, tracking 0.02–0.06em): mobile tab bar labels, badge counts, section eyebrows (often uppercase + tracked). Mono.

### Named Rules

**The Terminal Dominance Rule.** IBM Plex Mono is the default. IBM Plex Sans is the exception. Mono speaks for the product; Sans speaks for the user. Never use Sans in navigation, buttons, labels, counts, or timestamps.

**The Tabular Numbers Rule.** All numeric displays — star counts, like counts, comment counts, follower counts, timestamps — use `font-variant-numeric: tabular-nums`. Count changes must not cause layout shift.

**The Lowercase Default.** Product UI labels, nav items, and button text are lowercase by default. This is intentional brand voice (terminal-influenced), not an oversight. Uppercase is reserved for section eyebrows with letter-spacing ≥ 0.05em (e.g. `// recent updates`, `NEARBY BUILDERS`).

## 4. Elevation

Locatic is flat by default. Surfaces use tonal layering (canvas → surface → surface-alt) to establish depth without shadows. Cards rest at rest. Shadows appear only in response to state changes or floating elements.

### Shadow Vocabulary

- **Card shadow** (`0 1px 0 oklch(100% 0 0 / 0.04), 0 12px 32px oklch(0% 0 0 / 0.18)`): applied on card `:hover` only. Accompanied by a border color bump from `line` to `line-strong`. This is the only interactive elevation change on the main feed.
- **Floating shadow** (`0 1px 0 oklch(100% 0 0 / 0.05), 0 18px 44px oklch(0% 0 0 / 0.28)`): dropdowns, command menus, city search listbox, modals. A stronger lift that separates the element clearly from the page.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Adding a shadow to a non-interactive element or a resting card is prohibited. Elevation is earned through state — hover, focus, or float.

**The Two-Shadow Rule.** The system has exactly two shadow values: `card` (hover state) and `floating` (detached elements). Do not invent intermediate values or add blur-only glows as decorative accents.

## 5. Components

### Buttons

Terse and functional. All button text is mono, lowercase, and minimal. Buttons do not have icons unless the icon carries information the label does not (e.g. the pin icon next to "pin to profile").

- **Shape:** 4px radius (`rounded-control`) — slightly rounded, never pill on a standard button.
- **Brand (primary CTA):** Signal Teal background (`oklch(72% 0.17 185)`) with Deep Indigo Canvas foreground (`oklch(14% 0.005 230)`). Padding: 6px 14px. Used for post, reply, and save actions.
- **Outline (secondary):** Transparent background, `line` border, `text-muted` foreground. Hover: border shifts to `line-strong`, text to `text`. Used for follow, message, edit profile.
- **Ghost:** Transparent, no border, `text-faint` foreground. Used for mark-read, cancel, and inline label actions.
- **Disabled state:** All variants drop opacity to 0.5, cursor changes to `default`. Do not change color values — opacity-only.
- **Size variants:** `meta` (the dominant size — 6px 14px), `sm` (for compact contexts), `icon` (square, 32px).

### Cards

The core unit. Every project card is a contained, clickable surface. Cards are never nested.

- **Corner style:** 6px radius (`rounded-card`).
- **Background:** `surface` (`oklch(17.5% 0.007 230)`).
- **Border:** 1px solid `line` (`oklch(28% 0.007 230)`) at rest; shifts to `line-strong` on hover.
- **Shadow strategy:** none at rest; `card` shadow on hover (see Elevation).
- **Internal padding:** 18px 20px (cozy default); 14px 16px (compact variant).
- **Structure:** repo name row → description → meta row (lang · last commit · stars · likes · comments) → author row (avatar · name · city pill). This order is invariant.

### Project Card Variant: Profile Pin

When displayed on the profile page, cards gain a top chrome bar (1px bottom border, 11px mono label, pin button) that sits above the standard card body. The chrome bar uses `surface-alt` background. The pin button uses Brand variant when pinned, Outline variant when unpinned.

### Inputs / Fields

- **Style:** 1px `line` border, `canvas` background (inputs sit in `surface` contexts — canvas recedes appropriately), 4px radius.
- **Font:** IBM Plex Mono, 13–14px, `text` color. Placeholder in `text-faint`.
- **Focus:** 2px solid Signal Teal outline, offset 2px. The border color does not change on focus — outline replaces it.
- **Search inputs:** add a 14px Search icon at left, 36px left padding.
- **Textarea:** same border system; `resize: none`; minimum 72px height for comment inputs.

### City Combobox (Signature Component)

The city search in Explore is the product's most complex input. It combines a standard text input with an accessible dropdown listbox.

- **Input:** `role="combobox"`, `aria-expanded`, `aria-controls` pointing to the listbox. Search icon at left.
- **Listbox:** `role="listbox"`, `max-h-72`, `overflow-y-auto`, `rounded-card`, `border line`, `bg-surface`, `shadow-floating`. Appears directly below the input.
- **Options:** `role="option"`, `min-h-11` (44px touch target), mono 12px city name at left, `Plus` icon at right (12px), `hover:bg-surface-alt`.
- **Selected state:** selected cities become removable pills (city name + ×) above the input row, not options inside the dropdown.
- **Keyboard:** `ArrowDown`/`ArrowUp` moves `aria-activedescendant`, `Enter` selects, `Escape` closes. This is non-negotiable for WCAG compliance.

### Navigation: Sidebar (Desktop)

- **Width:** 220px (`--lx-sidebar-width`).
- **Background:** `canvas`.
- **Active indicator:** 2px solid Signal Teal, `border-radius: 0 2px 2px 0`, positioned `left: 0, top: 6px, bottom: 6px` on the row container. This bar, not background color, is the primary active signal.
- **Active icon:** tinted to Signal Teal. Inactive icon: `text-faint`.
- **Label:** mono 13px, `text` when active, `text-muted` when inactive.
- **Unread badge:** pill `rounded-pill`, Signal Teal bg, dark foreground, mono 10px. Shows numeric count with `99+` cap.
- **Logo:** 22px square with map-pin SVG inside, Signal Teal background, dark pin path. No text variant.

### Navigation: Mobile Tab Bar

- **Height:** `calc(72px + env(safe-area-inset-bottom))`.
- **Background:** `canvas` with 1px top `line` border.
- **Active indicator:** 2px Signal Teal pill (`w-6 h-0.5 rounded-pill`) centered above the icon, `margin-top: -2px`.
- **Icon:** 20px, Signal Teal when active, `text-faint` otherwise.
- **Label:** mono 9.5px, `text` when active, `text-faint` otherwise.
- **Notification badge:** absolute-positioned `rounded-pill`, Signal Teal bg, mono 9px, `-top-2 -right-3`. Shows count, `99+` cap.
- **Touch target:** each tab item `min-h-11` (44px).

### ProfileSocialDialog

A standard shadcn Dialog (`max-w-xl`) rendered when the user taps a follower or following count.

- **Header:** 1px bottom `line`, px-5 py-4, mono `text-sm` lowercase title.
- **Body:** `max-h-[70vh]`, overflow-y-auto. User rows: `min-h-14`, flex gap-3, `border-b line`, `hover:bg-surface-alt`. Avatar 36px, display name mono 12.5px semibold, handle + city mono 11px `text-faint`.
- **Empty state:** centered mono xs `text-faint`, py-8.
- **Close behavior:** dialog closes before navigation fires. Do not let the dialog remain open while the route changes.

### Chips and Pills

- **City pill:** `rounded-pill`, 1px `line` border, `surface-alt` background, mono 11px `text-muted`, `map-pin` icon (11px) at left. Removable variant adds an ×-button after the city name.
- **Status pill:** `border-radius: 3px` (intentionally less round than city pill), hue-matched per build status (shipping=145, building=200, exploring=280, hiring=35). Background at 10% opacity, border at 25% opacity of the status hue. 5px dot indicator inside.
- **Recommended badge:** `rounded-sm`, Signal Teal at 12% bg, 30% border, brand color text. Mono 9.5px lowercase. Used on the first card in the Explore feed only.

### Notification Rows

Interactive `<button>` elements spanning full width in the notification list.

- **Unread:** subtle Signal Teal tint background (`oklch(72% 0.17 185 / 0.04)`). Read: transparent.
- **Layout:** `flex items-start gap-3`, 36px avatar with 18px icon badge in the bottom-right corner.
- **Body:** actor display name in mono semibold, action text in sans 13.5px, timestamp in mono 11px `text-faint` below.
- **Focus:** 2px Signal Teal ring, no background override on focus.
- **Click behavior:** marks read optimistically, then navigates. Mark-read and navigate are one action — never two separate interactions.

## 6. Do's and Don'ts

### Do:

- **Do** use IBM Plex Mono for all product UI text: labels, buttons, nav, timestamps, counts, section headers. Use IBM Plex Sans only for user-authored content (bios, descriptions, comments, README text).
- **Do** apply `font-variant-numeric: tabular-nums` to every numeric display (star counts, like counts, follower counts, commit counts). Layout must not shift when numbers update.
- **Do** maintain a minimum 44px touch target on all interactive elements in the mobile shell. Use `min-h-11` (44px) as the floor for tab items, notification rows, and combobox options.
- **Do** commit UI actions locally first. Optimistic state fires immediately; external sync (GitHub starring) is best-effort and surfaced as a recoverable toast if it fails, never as a blocking error.
- **Do** keep the Signal Teal accent at ≤10% of any screen surface. Reserve it for engaged interactive state, focus rings, and badge counts.
- **Do** use `shadow-floating` for all detached floating surfaces: city search dropdown, Dialog/Sheet, command menus. Never use `shadow-card` for floating elements.
- **Do** use exact semantic Tailwind utilities (`bg-surface`, `text-text-muted`, `rounded-card`, `shadow-card`) instead of direct `var(--lx-*)` calls or inline styles for layout.
- **Do** close dialogs before navigating. When a dialog row navigates to a new route, call `onOpenChange(false)` before (or immediately with) the `navigate()` call.
- **Do** sync typed search params with URL via TanStack Router `validateSearch` and `navigate({ search: ... })`. Filter state (builder query, city IDs) must be reload-safe and shareable.

### Don't:

- **Don't** add a light mode. Never add `prefers-color-scheme: light` overrides, a theme toggle, or conditional color classes for a light variant. The dark palette is the product identity.
- **Don't** use glassmorphism. No `backdrop-filter: blur(...)` on card panels, sidebar backgrounds, or nav overlays outside of modals. If it looks like frost glass, it's wrong.
- **Don't** use gradient text (`background-clip: text` + gradient background). Use a single solid color. Emphasis via weight or size.
- **Don't** put a colored `border-left` greater than 1px as a decorative stripe on cards, list items, or alerts. Use full borders, background tints, or leading icons instead.
- **Don't** render the same action affordance in two places on one screen. The project detail page has one like button (top action bar), one stats row (metrics only). GitHub external link belongs once — either in the action bar or beside the heading, not both.
- **Don't** use `as never` type casts on TanStack Router `navigate()` calls. Register the router via `declare module '@tanstack/react-router' { interface Register { router: typeof router } }` so route params and search are type-checked at the call site.
- **Don't** manage optimistic UI state with `useState` overrides per-action. Use TanStack Query `useMutation` with `onMutate` / `onError` / `onSettled`. Manual `likedOverride`, `followedOverride`, `commentLikeOverrides` state variables are prohibited in new code.
- **Don't** use `grid-cols-3` for a 4-item tab row. Tab bars must have as many columns as items (`grid-cols-4` for 4 tabs) or use `flex` with equal flex-1 sizing.
- **Don't** show the city combobox dropdown before the input has received focus. Use `aria-expanded` only when the input is actively focused or a query string is present. The dropdown must close on `Escape` and on click-outside.
- **Don't** use `style={{}}` for layout properties. All layout uses Tailwind utility classes or CSS custom properties via `var(--lx-*)` when a semantic token is genuinely unavailable. Never inline padding, margin, width, or display properties.
- **Don't** look like GitHub, LinkedIn, Product Hunt, or generic SaaS dark mode. If the palette or layout could be mistaken for any of these, it is wrong.
