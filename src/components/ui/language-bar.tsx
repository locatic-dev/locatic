import { cn } from '@/lib/utils'
import { langColor } from './lang-dot'

type LanguageWeight = { name: string; bytes: number }

/**
 * A thin horizontal language proportion bar (GitHub-style) tinted by each
 * language's color. This is a content signal, not a brand accent, so it is
 * allowed at rest. It is a horizontal data bar, never a side stripe.
 */
export function LanguageBar({
  languages,
  className,
}: {
  languages: LanguageWeight[]
  className?: string
}) {
  const langs = languages.filter((language) => language.name)
  if (langs.length === 0) {
    return null
  }

  const totalBytes = langs.reduce(
    (sum, language) => sum + Math.max(0, language.bytes),
    0,
  )
  const segments = langs.map((language) => ({
    name: language.name,
    color: langColor(language.name),
    pct:
      totalBytes > 0
        ? (Math.max(0, language.bytes) / totalBytes) * 100
        : 100 / langs.length,
  }))
  const label = segments
    .map((segment) => `${segment.name} ${Math.round(segment.pct)}%`)
    .join(', ')

  return (
    <div className={cn('w-full', className)}>
      <span
        aria-hidden="true"
        className="flex h-[3px] w-full overflow-hidden rounded-full"
      >
        {segments.map((segment) => (
          <span
            key={segment.name}
            style={{
              flexGrow: segment.pct,
              flexBasis: 0,
              minWidth: 6,
              background: segment.color,
            }}
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  )
}
