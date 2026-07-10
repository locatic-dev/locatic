export const LANG_COLORS: Record<string, string> = {
  Rust: '#dea584',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Go: '#00ADD8',
  Python: '#3572A5',
  Swift: '#F05138',
  Zig: '#ec915c',
  C: '#555555',
  'C++': '#f34b7d',
  Ruby: '#701516',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  OCaml: '#ef7a08',
  Lua: '#000080',
  Kotlin: '#A97BFF',
  Svelte: '#ff3e00',
  Solidity: '#AA6746',
  Nix: '#7e7eff',
  Shell: '#89e051',
  Java: '#b07219',
  'C#': '#178600',
  PHP: '#4F5D95',
  Scala: '#c22d40',
  Dart: '#00B4AB',
}

const LANG_FALLBACK_COLOR = '#8b949e'

/** Resolve a stable accent color for a language; used for card language signatures. */
export function langColor(lang?: string | null): string {
  if (!lang) return LANG_FALLBACK_COLOR
  return LANG_COLORS[lang] ?? LANG_FALLBACK_COLOR
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
        className={`inline-flex min-h-7 items-center gap-1.5 rounded-pill border px-2.5 py-1 font-mono text-[11px] leading-none text-text ${className ?? ''}`}
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
      className={`inline-flex items-center gap-1.5 font-mono text-[11.5px] ${className ?? ''}`}
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
