import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PublicFooter } from '@/components/app-shell/public-footer'
import { PublicHeader } from '@/components/app-shell/public-header'
import { Button } from '@/components/ui/button'
import { getFreshExploreSearch } from '@/features/explore/state'

/** Page frame for signed-out visitors: public header, `<main>`, footer. */
export function PublicProfileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <PublicHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-x-clip px-(--lx-gutter) pt-6 pb-16"
      >
        {children}
      </main>
      <PublicFooter />
    </div>
  )
}

/** The missing or non-public profile page (served with a 404). */
export function BuilderNotFound() {
  return (
    <PublicProfileFrame>
      <div className="lx-page-width-profile flex flex-col items-start gap-3 py-4">
        <h1 className="m-0 text-headline text-text">builder not found</h1>
        <p className="m-0 text-body text-text-muted">
          this profile doesn&apos;t exist or isn&apos;t public.
        </p>
        <Button asChild size="touch">
          <Link
            to="/explore"
            search={{ ...getFreshExploreSearch(), mode: 'builders' }}
          >
            explore builders
          </Link>
        </Button>
      </div>
    </PublicProfileFrame>
  )
}
