import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { getFreshExploreSearch } from '@/features/explore/state'

// Hero entrance choreography runs on pure CSS (`lx-hero-up` + `--hero-step`
// stagger) so the above-the-fold copy animates the moment styles load —
// SSR pages must never sit invisible waiting for the client bundle to
// hydrate. Last step lands ~700ms in, inside the hero budget.
export function HeroCopy() {
  return (
    <div>
      <p className="lx-hero-up m-0 text-eyebrow text-place [--hero-step:0]">
        {'// for builders who ship'}
      </p>

      <h1 className="lx-hero-up mt-5 mb-0 text-hero text-text [--hero-step:1]">
        github, with a <span className="text-brand">map.</span>
      </h1>

      <p className="lx-hero-up mt-5 mb-0 font-sans text-lg text-text-muted [--hero-step:2]">
        find the people shipping in your city.
      </p>

      <div className="lx-hero-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 [--hero-step:3]">
        {/* Explore is public: visitors can look before they sign in. */}
        <Button asChild variant="primary" size="touch" className="h-10 px-5">
          <Link to="/explore" search={getFreshExploreSearch()}>
            explore your city →
          </Link>
        </Button>
        <Link
          to="/sign-in/$"
          className="inline-flex h-10 items-center gap-2 font-mono text-label text-text-muted no-underline transition-colors hover:text-text pointer-coarse:min-h-11"
        >
          <span aria-hidden="true" className="text-brand">
            $
          </span>
          sign in with github
        </Link>
      </div>
    </div>
  )
}
