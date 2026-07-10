// Theme registry for the accent-family variants defined in src/styles.css.
// A theme swaps only the accent tokens via html[data-theme]; neutral surfaces
// are shared. Keep `preview` values in sync with the CSS variant blocks —
// they exist so the picker can render a swatch for a theme that isn't active.

export const THEME_IDS = ['teal', 'violet', 'amber'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME_ID: ThemeId = 'teal'

export const THEMES: Array<{
  id: ThemeId
  label: string
  /** Accent preview swatch — mirrors the theme's --primary in styles.css. */
  preview: string
  /** Secondary accent preview — mirrors --lx-accent-2 in styles.css. */
  preview2: string
}> = [
  {
    id: 'teal',
    label: 'teal',
    preview: 'oklch(72% 0.15 195)',
    preview2: 'oklch(74% 0.11 300)',
  },
  {
    id: 'violet',
    label: 'violet',
    preview: 'oklch(74% 0.15 292)',
    preview2: 'oklch(75% 0.11 195)',
  },
  {
    id: 'amber',
    label: 'amber',
    preview: 'oklch(76% 0.14 75)',
    preview2: 'oklch(72% 0.11 210)',
  },
]
