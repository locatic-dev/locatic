import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/button'

/**
 * Stands in for a personal action (follow, like, message, dismiss) on public
 * Explore: a link to sign in that carries the visitor's current URL as the
 * post-auth destination (plan items A6, C1). No mutation is reachable.
 */
export function SignInLink({
  children,
  label,
  redirect,
  variant = 'secondary',
}: {
  children: ReactNode
  /** Accessible name, e.g. "Sign in to follow Mira". */
  label: string
  /** Sanitised destination (`toSafeRelativeUrl`); undefined drops it. */
  redirect: string | undefined
  variant?: ButtonVariant
}) {
  return (
    <Button asChild variant={variant} size="touch">
      <Link to="/sign-in/$" search={{ redirect }} aria-label={label}>
        {children}
      </Link>
    </Button>
  )
}
