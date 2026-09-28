import { cn } from '@/lib/utils'

// Single source of truth for the Locatic pin mark. Keep this path in sync with
// public/favicon.svg (and the static public/logo.svg export).
const MARK_PATH =
  'M12 2.2C7.45 2.2 3.8 5.85 3.8 10.4c0 5.3 6.55 10.85 7.55 11.65a1.05 1.05 0 0 0 1.3 0C13.65 21.25 20.2 15.7 20.2 10.4 20.2 5.85 16.55 2.2 12 2.2ZM10.9 7.6h2.2a1.6 1.6 0 0 1 1.5 1.5v2.2a1.6 1.6 0 0 1-1.5 1.5h-2.2a1.6 1.6 0 0 1-1.5-1.5V9.1a1.6 1.6 0 0 1 1.5-1.5Z'

interface LogoProps {
  size?: number
  className?: string
  /** Accessible name. Omit when the mark sits next to the "locatic" wordmark. */
  alt?: string
}

/**
 * The pin mark, rendered inline and painted with `currentColor` so it follows
 * the active accent theme (`text-brand` by default). A static `<img>` cannot
 * read CSS variables and would stay teal under violet or amber.
 */
export function Logo({ size = 24, className, alt = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn('text-brand', className)}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d={MARK_PATH}
      />
    </svg>
  )
}
