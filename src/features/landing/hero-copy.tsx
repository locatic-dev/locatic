import { Link } from '@tanstack/react-router'
import { BrandIcon } from '@/components/ui/brand-icon'
import { Button } from '@/components/ui/button'
import { getFreshExploreSearch } from '@/features/explore/state'

// Hero entrance choreography runs on pure CSS (`lx-hero-up` + `--hero-step`
// stagger) so the above-the-fold copy animates the moment styles load —
// SSR pages must never sit invisible waiting for the client bundle to
// hydrate. Total sequence: last step lands ~860ms, at the edge of the
// hero budget.
export function HeroCopy() {
  return (
    <div>
      <h1 className="m-0 font-mono text-[clamp(40px,7vw,88px)] leading-[0.96] font-bold tracking-[-0.045em] text-text">
        <span className="lx-hero-up block [--hero-step:0]">GitHub</span>
        <span className="lx-hero-up block [--hero-step:1]">
          with a <span className="text-brand">map.</span>
        </span>
      </h1>

      <p className="lx-hero-up mt-7 max-w-115 font-sans text-[17px] leading-[1.55] text-text-muted [--hero-step:2]">
        discover what developers in your city are building. follow the builders
        you like and message them directly.
      </p>

      <div className="lx-hero-up mt-9 flex flex-wrap items-center gap-3 [--hero-step:3]">
        <Link
          to="/sign-in/$"
          className="inline-flex min-h-11 items-center gap-2.5 rounded-control border border-brand/30 bg-brand px-5.5 py-3.5 font-mono text-[13.5px] font-semibold text-brand-foreground no-underline shadow-card transition-all hover:bg-brand/90 hover:shadow-floating active:scale-[0.98]"
        >
          <BrandIcon name="github" size={16} />
          sign in with GitHub
        </Link>
        {/* Explore is public: visitors can look before they sign in. */}
        <Button asChild variant="secondary" size="touch">
          <Link to="/explore" search={getFreshExploreSearch()}>
            browse explore
          </Link>
        </Button>
      </div>

      <div className="lx-hero-up mt-5 font-mono text-label text-text-faint [--hero-step:4]">
        free · no spam · only public repo scope required
      </div>

      <button
        className="lx-hero-up mt-1 inline-flex min-h-11 items-center border-0 bg-transparent p-0 font-mono text-label text-text-muted transition-colors hover:text-text [--hero-step:5]"
        onClick={() =>
          document
            .getElementById('features')
            ?.scrollIntoView({ behavior: 'smooth' })
        }
        type="button"
      >
        see how it works <span className="lx-nudge-down ml-1">↓</span>
      </button>
    </div>
  )
}
