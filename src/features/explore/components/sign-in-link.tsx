import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/button'

/**
 * Stands in for a personal action (follow, like, message, dismiss) on public
 * Explore: a link to sign in that carries the visitor's current URL as the
 * post-auth destination (plan items A6, C1). No mutation is reachable.
 */
export function SignInLink({
  appearance = 'button',
  children,
  label,
  redirect,
  variant = 'secondary',
}: {
  /** `text` is a quiet inline link with no padding, for card footers. */
  appearance?: 'button' | 'text'
  children: ReactNode
  /** Accessible name, e.g. "Sign in to follow Mira". */
  label: string
  /** Sanitised destination (`toSafeRelativeUrl`); undefined drops it. */
  redirect: string | undefined
  variant?: ButtonVariant
}) {
  if (appearance === 'text') {
    return (
      <Link
        to="/sign-in/$"
        search={{ redirect }}
        aria-label={label}
        className="inline-flex h-7 items-center rounded-control font-mono text-label text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:min-h-11"
      >
        {children}
      </Link>
    )
  }

  return (
    <Button asChild variant={variant} size="touch">
      <Link to="/sign-in/$" search={{ redirect }} aria-label={label}>
        {children}
      </Link>
    </Button>
  )
}
