import {
  Link,
  rootRouteId,
  useRouteContext,
  useRouterState,
} from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { useHydrationSafeHref } from '@/lib/return-href'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'

/**
 * Where sign-in and sign-up return to: the page the visitor is on (plan item
 * A6). The landing page passes none, so the usual fallbacks apply (Home for
 * members, onboarding then Explore for new accounts).
 */
export function getPublicAuthRedirect(pathname: string, href: string) {
  if (pathname === '/') return undefined
  return toSafeRelativeUrl(href) ?? undefined
}

// Top bar shared by public pages (landing, legal, public Explore). Entrance
// runs on CSS (`lx-hero-up`) — above-the-fold chrome must never wait on
// hydration to become visible.
export function PublicHeader() {
  // Root route context through the router, so this shared component never
  // imports the root route module.
  const isAuthenticated = useRouteContext({
    from: rootRouteId,
    select: (context) => context.auth.isAuthenticated,
  })
  const location = useRouterState({ select: (state) => state.location })
  const redirect = getPublicAuthRedirect(
    location.pathname,
    useHydrationSafeHref(location.href),
  )

  return (
    <header className="lx-hero-up relative z-2 flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-line px-(--lx-gutter) py-4 [--hero-step:0]">
      <Link to="/" className="flex items-center gap-2.5 text-text no-underline">
        <Logo size={32} />
        <span className="text-title font-bold">locatic</span>
      </Link>
      <nav
        aria-label="Account"
        className="flex flex-wrap items-center gap-2 font-mono text-label text-text-muted"
      >
        {isAuthenticated ? (
          <Button asChild variant="secondary" size="touch">
            <Link to="/home">home</Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="secondary" size="touch">
              <Link to="/sign-in/$" search={{ redirect }}>
                sign in
              </Link>
            </Button>
            <Button asChild variant="primary" size="touch">
              <Link to="/sign-up/$" search={{ redirect }}>
                sign up
              </Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  )
}
