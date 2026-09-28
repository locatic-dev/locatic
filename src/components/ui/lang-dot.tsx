/**
 * OKLCH hue per language, taken from the GitHub linguist colour. Lightness
 * and chroma are fixed tokens (`--lx-lang-l`, `--lx-lang-c` in styles.css) so
 * every language reads at the same weight in all three themes. `null` marks
 * a language whose GitHub colour is grey; it renders neutral.
 */
export const LANG_HUES: Record<string, number | null> = {
  Rust: 51,
  TypeScript: 253,
  JavaScript: 102,
  Go: 224,
  Python: 247,
  Swift: 32,
  Zig: 50,
  C: null,
  'C++': 7,
  Ruby: 26,
  Elixir: 315,
  Haskell: 295,
  OCaml: 54,
  Lua: 264,
  Kotlin: 297,
  Svelte: 34,
  Solidity: 46,
  Nix: 280,
  Shell: 135,
  Java: 69,
  'C#': 141,
  PHP: 272,
  Scala: 20,
  Dart: 188,
}

const LANG_NEUTRAL_COLOR = 'oklch(var(--lx-lang-l) 0 0)'

/** Resolve a stable colour for a language; used for card language signatures. */
export function langColor(lang?: string | null): string {
  const hue = lang ? LANG_HUES[lang] : undefined
  if (hue == null) return LANG_NEUTRAL_COLOR
  return `oklch(var(--lx-lang-l) var(--lx-lang-c) ${hue})`
}

interface LangDotProps {
  lang: string
  size?: number
  showLabel?: boolean
  /**
   * `dot` (default): bare dot + optional inline label, for dense metadata rows.
   * `chip`: tinted pill anatomy (bg at low opacity + border at 50%), matching
   * the tag chip convention used elsewhere for language/topic signals.
   */
  variant?: 'dot' | 'chip'
  className?: string
}

export function LangDot({
  lang,
  size = 8,
  showLabel = false,
  variant = 'dot',
  className,
}: LangDotProps) {
  const color = langColor(lang)

  if (variant === 'chip') {
    return (
      <span
        className={`inline-flex min-h-7 items-center gap-1.5 rounded-pill border px-2.5 py-1 font-mono text-meta leading-none text-text ${className ?? ''}`}
        style={{
          background: `color-mix(in oklch, ${color} 12%, transparent)`,
          borderColor: `color-mix(in oklch, ${color} 50%, transparent)`,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: size,
            height: size,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
          aria-hidden
        />
        {lang}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-label ${className ?? ''}`}
    >
      <span
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
        aria-hidden
      />
      {showLabel && <span className="text-text-muted">{lang}</span>}
    </span>
  )
}
