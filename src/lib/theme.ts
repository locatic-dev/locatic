// Theme registry for the accent-family variants defined in src/styles.css.
// CSS is the single source of truth for token values; this module only exposes
// stable IDs and labels for next-themes and the picker.

export const THEME_IDS = ['teal', 'violet', 'amber'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME_ID: ThemeId = 'teal'

export const THEMES: Array<{
  id: ThemeId
  label: string
}> = [
  {
    id: 'teal',
    label: 'teal',
  },
  {
    id: 'violet',
    label: 'violet',
  },
  {
    id: 'amber',
    label: 'amber',
  },
]
