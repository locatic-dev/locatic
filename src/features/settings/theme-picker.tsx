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
              <label
                htmlFor={inputId}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border px-3.5 py-2.5 font-mono text-[12px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas ${
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
                  <span className="h-3.5 w-3.5 rounded-full border border-line-strong bg-primary" />
                  <span className="h-3.5 w-3.5 rounded-full border border-line-strong bg-brand-2" />
                </span>
                {themeOption.label}
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
