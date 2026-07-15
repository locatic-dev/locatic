import { Link } from '@tanstack/react-router'
import { BrandIcon } from '@/components/ui/brand-icon'
import { ArrowRight } from '@/lib/icons'

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
        Discover what developers in your city are building. Like their projects.
        Star their repos. Follow the builders.
      </p>

      <div className="lx-hero-up mt-9 flex flex-wrap items-center gap-3 [--hero-step:3]">
        <Link
          to="/sign-in/$"
          className="inline-flex min-h-11 items-center gap-2.5 rounded-[5px] border border-brand/30 bg-brand px-5.5 py-3.5 font-mono text-[13.5px] font-semibold text-brand-foreground no-underline shadow-card transition-all hover:bg-brand/90 hover:shadow-floating active:scale-[0.98]"
        >
          <BrandIcon name="github" size={16} />
          Sign in with GitHub
        </Link>
        <Link
          to="/sign-in/$"
          className="inline-flex min-h-11 items-center gap-2 rounded-card border border-line bg-transparent px-4.5 py-3.5 font-mono text-[13.5px] text-text-muted no-underline transition-colors hover:border-line-strong hover:bg-surface hover:text-text active:scale-[0.98]"
        >
          browse the feed <ArrowRight size={14} />
        </Link>
      </div>

      <div className="lx-hero-up mt-5 font-mono text-[11.5px] text-text-faint [--hero-step:4]">
        free · no spam · only public repo scope required
      </div>

      <button
        className="lx-hero-up mt-1 inline-flex min-h-11 items-center border-0 bg-transparent p-0 font-mono text-[11.5px] text-text-muted transition-colors hover:text-text [--hero-step:5]"
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
