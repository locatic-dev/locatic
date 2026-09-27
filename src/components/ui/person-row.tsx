import type { ReactNode } from 'react'

import { LocationPill, type CityPillLocation } from './city-pill'
import { LxAvatar } from './lx-avatar'
import { cn } from '@/lib/utils'

// The compact "avatar + identity + trailing action" row, previously re-implemented
// in NearbyBuilderRow, ProfileNetworkSection, the home feed, and the liked-by
// dialog. One layout, three interactive modes:
//   - `renderIdentity` — caller wraps the identity in a typed element (e.g. a
//     TanStack `Link` with preload); keeps route types intact at the call site.
//   - `onClick`        — identity is a button.
//   - neither          — identity is static.
// The trailing `action` sits outside the interactive identity so its own buttons
// stay independently clickable.
const identityBase =
  'flex min-w-0 flex-1 items-center gap-3 rounded-control text-left'
// Focus comes from the global :focus-visible rule.
const identityInteractive =
  'bg-transparent p-0 transition-colors hover:text-text'

export interface PersonRowProps {
  avatarName: string
  avatarUrl?: string | null
  size?: number
  title: ReactNode
  meta?: ReactNode
  /** Optional second meta line (e.g. a stats line under the handle). */
  subtitle?: ReactNode
  /** Trailing action(s) — kept outside the clickable identity region. */
  action?: ReactNode
  /**
   * Disclosed location, shown as a city pill beside the identity: a link to
   * the city page for exact-city members, plain text for a region, nothing
   * when hidden. Kept outside the identity so the link is its own tab stop.
   */
  location?: CityPillLocation
  onClick?: () => void
  ariaLabel?: string
  /** Wrap the identity region in a custom element; overrides `onClick`. */
  renderIdentity?: (content: ReactNode, className: string) => ReactNode
  /** Extra classes on the identity element — e.g. a surface-fill hover. */
  identityClassName?: string
  className?: string
}

export function PersonRow({
  avatarName,
  avatarUrl,
  size = 36,
  title,
  meta,
  subtitle,
  action,
  location,
  onClick,
  ariaLabel,
  renderIdentity,
  identityClassName,
  className,
}: PersonRowProps) {
  const content = (
    <>
      {/* The name sits beside the avatar, so the avatar is not announced. */}
      <LxAvatar
        name={avatarName}
        avatarUrl={avatarUrl ?? undefined}
        size={size}
        decorative
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[13px] font-semibold text-text">
          {title}
        </div>
        {meta != null && (
          <div className="truncate font-mono text-meta text-text-faint">
            {meta}
          </div>
        )}
        {subtitle != null && (
          <div className="mt-0.5 truncate font-mono text-meta text-text-faint">
            {subtitle}
          </div>
        )}
      </div>
    </>
  )

  let identity: ReactNode
  if (renderIdentity) {
    identity = renderIdentity(
      content,
      cn(identityBase, identityInteractive, identityClassName),
    )
  } else if (onClick) {
    identity = (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(identityBase, identityInteractive, identityClassName)}
      >
        {content}
      </button>
    )
  } else {
    identity = (
      <div className={cn(identityBase, identityClassName)}>{content}</div>
    )
  }

  return (
    <div className={cn('flex min-h-11 items-center gap-3', className)}>
      {identity}
      {location && location.kind !== 'none' && (
        <LocationPill
          location={location}
          className="min-w-0 max-w-2/5 shrink"
        />
      )}
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  )
}
