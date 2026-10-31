import { Link } from '@tanstack/react-router'
import { MapPin, X } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface CityPillProps {
  city: string
  /** Visible text when shorter than `city` ("Hyderabad"); `city` stays the title. */
  label?: string
  /**
   * Exact-city members only. With an id (and no `onRemove`) the pill links to
   * the city page; without one it is plain text, which is how region-only
   * labels render.
   */
  cityId?: string | null
  /**
   * The city page's URL segment. Links use it when known, so crawlers and
   * people skip the id → slug redirect; stored snapshots only carry the id.
   */
  citySlug?: string | null
  onRemove?: () => void
  className?: string
  truncate?: boolean
  /**
   * `pill` (default) is the bordered chip with a pin. `inline` is bare mono
   * eyebrow text in the place colour, for identity lines ("HYDERABAD · 2H").
   */
  variant?: 'pill' | 'inline'
}

/**
 * Public location as the visibility policy discloses it (`LocationDisclosure`
 * in `convex/lib/visibility.ts`), typed structurally so this primitive stays
 * free of Convex imports.
 */
export type CityPillLocation =
  | { kind: 'city'; cityId: string; cityName: string; citySlug?: string }
  | { kind: 'region'; regionLabel: string }
  | { kind: 'none' }

const pillClassName =
  'inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-pill border border-line bg-surface-alt px-2.5 py-1 font-mono text-meta leading-none text-place'
const inlineClassName =
  'inline-flex max-w-full min-w-0 items-center font-mono text-eyebrow text-place'

export function CityPill({
  city,
  label = city,
  cityId,
  citySlug,
  onRemove,
  className,
  truncate = true,
  variant = 'pill',
}: CityPillProps) {
  const inline = variant === 'inline'
  const baseClassName = inline ? inlineClassName : pillClassName
  const content = (
    <>
      {!inline && <MapPin size={10} className="shrink-0 text-place" />}
      <span
        className={cn(
          'min-w-0',
          truncate ? 'truncate' : 'wrap-anywhere whitespace-normal leading-4',
        )}
      >
        {label}
      </span>
    </>
  )

  if (cityId && !onRemove) {
    return (
      // The city page also resolves a city id, redirecting it
      // to the slug.
      <Link
        to="/c/$slug"
        params={{ slug: citySlug || cityId }}
        title={`${city} city page`}
        className={cn(
          baseClassName,
          'no-underline transition-colors hover:text-text',
          // The bare inline text is a ~15px line; as a link it grows to a 24px
          // target (44px on coarse pointers), its text centred.
          inline
            ? 'min-h-6 pointer-coarse:min-h-11'
            : 'hover:border-line-strong',
          className,
        )}
      >
        {content}
      </Link>
    )
  }

  return (
    <span className={cn(baseClassName, className)} title={city}>
      {content}
      {onRemove && (
        // 24px with a mouse; on coarse pointers a 44px hit area overhangs the
        // 28px pill. The pill must not clip it, so it has no overflow-hidden
        // (the label truncates itself).
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${city}`}
          className="-my-1 -mr-1.5 ml-0.5 flex size-6 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text pointer-coarse:-my-3 pointer-coarse:-mr-2 pointer-coarse:size-11"
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
          citySlug={location.citySlug}
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
