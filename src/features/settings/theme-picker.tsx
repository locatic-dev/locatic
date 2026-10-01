import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { THEMES, DEFAULT_THEME_ID } from '@/lib/theme'

// Each swatch sits in its own `data-theme` scope and rebuilds the colour from
// the accent components that scope overrides. Tokens such as `--primary` and
// `--lx-accent` are resolved once at :root, so `bg-primary` / `bg-brand` would
// always show the active theme instead of the option's own accent.
const SWATCH_ACCENT = {
  backgroundColor:
    'oklch(var(--lx-accent-l) var(--lx-accent-c) var(--lx-accent-h))',
}
const SWATCH_ACCENT_2 = { backgroundColor: 'var(--lx-accent-2)' }

// Accent theme picker. Selection persists via next-themes localStorage; no
// backend involvement. Rendered only after mount so the active swatch never
// mismatches the SSR default.
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = mounted ? (theme ?? DEFAULT_THEME_ID) : DEFAULT_THEME_ID

  return (
    <fieldset>
      <legend className="sr-only">accent theme</legend>
      <div className="flex flex-wrap gap-2.5">
        {THEMES.map((themeOption) => {
          const selected = activeTheme === themeOption.id
          const inputId = `accent-theme-${themeOption.id}`

          return (
            <div key={themeOption.id}>
              <input
                id={inputId}
                type="radio"
                name="accent-theme"
                value={themeOption.id}
                checked={selected}
                onChange={() => setTheme(themeOption.id)}
                className="peer sr-only"
              />
              {/* The radio is visually hidden, so its label carries the
                  global focus recipe (2px solid focus colour, 2px offset). */}
              <label
                htmlFor={inputId}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border px-3.5 py-2.5 text-label transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${
                  selected
                    ? 'border-brand bg-brand-quiet text-text'
                    : 'border-line bg-surface text-text-muted hover:border-line-strong hover:text-text'
                }`}
              >
                <span
                  className="flex items-center -space-x-1"
                  data-theme={themeOption.id}
                  aria-hidden="true"
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-line-strong"
                    style={SWATCH_ACCENT}
                  />
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-line-strong"
                    style={SWATCH_ACCENT_2}
                  />
                </span>
                {themeOption.label}
                {themeOption.id === DEFAULT_THEME_ID ? (
                  <>
                    {' '}
                    <span className="text-text-muted">(default)</span>
                  </>
                ) : null}
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
