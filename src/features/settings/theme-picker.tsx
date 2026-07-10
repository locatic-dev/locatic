import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { THEMES, DEFAULT_THEME_ID } from '@/lib/theme'

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
    <div
      className="flex flex-wrap gap-2.5"
      role="radiogroup"
      aria-label="accent theme"
    >
      {THEMES.map((themeOption) => {
        const selected = mounted && activeTheme === themeOption.id

        return (
          <button
            key={themeOption.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(themeOption.id)}
            className={`inline-flex min-h-11 items-center gap-2.5 rounded-control border px-3.5 py-2.5 font-mono text-[12px] transition-colors ${
              selected
                ? 'border-brand bg-brand-quiet text-text'
                : 'border-line bg-surface text-text-muted hover:border-line-strong hover:text-text'
            }`}
          >
            <span className="flex items-center -space-x-1" aria-hidden="true">
              {/* Swatches preview a theme that isn't active, so they can't
                  come from the live tokens — values mirror styles.css. */}
              <span
                className="h-3.5 w-3.5 rounded-full border border-line-strong"
                style={{ background: themeOption.preview }}
              />
              <span
                className="h-3.5 w-3.5 rounded-full border border-line-strong"
                style={{ background: themeOption.preview2 }}
              />
            </span>
            {themeOption.label}
          </button>
        )
      })}
    </div>
  )
}
