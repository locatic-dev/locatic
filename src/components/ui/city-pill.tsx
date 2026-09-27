import { Link } from '@tanstack/react-router'
import { MapPin, X } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface CityPillProps {
  city: string
  /**
   * Exact-city members only. With an id (and no `onRemove`) the pill links to
   * the city page; without one it is plain text, which is how region-only
   * labels render.
   */
  cityId?: string | null
  onRemove?: () => void
  className?: string
  truncate?: boolean
}

/**
 * Public location as the visibility policy discloses it (`LocationDisclosure`
 * in `convex/lib/visibility.ts`), typed structurally so this primitive stays
 * free of Convex imports.
 */
export type CityPillLocation =
  | { kind: 'city'; cityId: string; cityName: string }
  | { kind: 'region'; regionLabel: string }
  | { kind: 'none' }

const pillClassName =
  'inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-pill border border-line bg-surface-alt px-2.5 py-1 font-mono text-meta leading-none text-text-muted'

export function CityPill({
  city,
  cityId,
  onRemove,
  className,
  truncate = true,
}: CityPillProps) {
  const content = (
    <>
      <MapPin size={10} className="shrink-0 text-text-faint" />
      <span
        className={cn(
          'min-w-0',
          truncate ? 'truncate' : 'wrap-anywhere whitespace-normal leading-4',
        )}
      >
        {city}
      </span>
    </>
  )

  if (cityId && !onRemove) {
    return (
      // The city page (plan item D5) resolves a city id and redirects to the
      // city's slug; location payloads carry the id, not the slug.
      <Link
        to="/c/$slug"
        params={{ slug: cityId }}
        title={`${city} city page`}
        className={cn(
          pillClassName,
          'no-underline transition-colors hover:border-line-strong hover:text-text',
          className,
        )}
      >
        {content}
      </Link>
    )
  }

  return (
    <span className={cn(pillClassName, className)} title={city}>
      {content}
      {onRemove && (
        // A 44px hit area that overhangs the 28px pill; the pill must not clip
        // it, so the pill has no overflow-hidden (the label truncates itself).
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${city}`}
          className="-my-3 -mr-2 ml-0.5 flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-faint transition-colors hover:text-text"
        >
          <X size={9} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}

/**
 * Renders a disclosed location: a city link for exact-city members, plain
 * region text for region-only users, nothing when nothing is disclosed.
 */
export function LocationPill({
  location,
  className,
  truncate,
}: {
  location: CityPillLocation
  className?: string
  truncate?: boolean
}) {
  switch (location.kind) {
    case 'city':
      return (
        <CityPill
          city={location.cityName}
          cityId={location.cityId}
          className={className}
          truncate={truncate}
        />
      )
    case 'region':
      return (
        <CityPill
          city={location.regionLabel}
          className={className}
          truncate={truncate}
        />
      )
    case 'none':
    default:
      return null
  }
}
