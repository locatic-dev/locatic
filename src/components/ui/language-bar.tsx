import { cn } from '@/lib/utils'
import { langColor } from './lang-dot'

type LanguageWeight = { name: string; bytes: number }

/** A compact language legend with an optional proportional signature. */
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
  return (
    <div
      className={cn(
        'flex max-w-full flex-col items-start gap-1.5 font-mono text-meta text-text-faint',
        className,
      )}
      role="group"
      aria-label="Project languages"
    >
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1">
        {segments.map((segment) => {
          const percentage = Math.round(segment.pct)

          return (
            <span
              key={segment.name}
              className="inline-flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: segment.color }}
              />
              <span className="text-text-muted">{segment.name}</span>
              <span>{percentage}%</span>
            </span>
          )
        })}
      </div>

      {segments.length > 1 && (
        <span
          aria-hidden="true"
          className="flex h-[3px] w-56 max-w-full gap-px overflow-hidden rounded-full bg-surface-alt"
        >
          {segments.map((segment) => (
            <span
              key={segment.name}
              className="rounded-full"
              style={{
                flexGrow: segment.pct,
                flexBasis: 0,
                minWidth: 6,
                background: segment.color,
              }}
            />
          ))}
        </span>
      )}
    </div>
  )
}
