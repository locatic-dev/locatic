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

interface LangDotProps {
  lang: string
  size?: number
  showLabel?: boolean
  className?: string
}

export function LangDot({
  lang,
  size = 8,
  showLabel = false,
  className,
}: LangDotProps) {
  const color = LANG_COLORS[lang] ?? '#8b949e'
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className ?? ''}`}
      style={{ fontFamily: 'var(--lx-font-mono)', fontSize: 11.5 }}
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
      {showLabel && <span style={{ color: 'var(--lx-text-3)' }}>{lang}</span>}
    </span>
  )
}
