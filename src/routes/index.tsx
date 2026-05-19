import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui/logo'
import { DotMap } from '@/components/ui/dot-map'
import { BrandIcon } from '@/components/ui/brand-icon'
import { ArrowRight, Star, Heart, MessageSquare, MapPin } from '@/lib/icons'
import { viewerQueryOptions } from '@/features/viewer/queries'
import type { ViewerBootstrapPayload } from '@/features/contracts'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated) {
      return
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    throw redirect({ to: bootstrap.needsOnboarding ? '/onboarding' : '/home' })
  },
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-canvas text-text">
      {/* Nav */}
      <header className="relative z-2 flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-line px-(--lx-gutter) py-4">
        <div className="flex items-center gap-2.5">
          <Logo size={24} />
          <span className="font-mono text-base font-bold tracking-[-0.02em]">
            locatic
          </span>
          <span className="ml-1 rounded-[3px] border border-line px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-text-faint">
            v0.1 · beta
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-3 font-mono text-[12.5px] text-text-muted">
          <a
            href="https://github.com"
            className="text-inherit no-underline transition-colors hover:text-text"
            target="_blank"
            rel="noopener noreferrer"
          >
            github
          </a>
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-3.5 py-2 font-mono text-[12.5px] text-text no-underline transition-colors hover:border-line-strong hover:bg-surface-alt"
          >
            sign in
          </Link>
        </nav>
      </header>

      {/* Dot map background */}
      <div
        className="pointer-events-none absolute top-16 inset-x-0 flex h-130 justify-center opacity-60"
        style={{
          maskImage:
            'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 40%, transparent 75%)',
        }}
      >
        <DotMap width={1200} height={520} />
      </div>

      {/* Hero */}
      <section className="relative z-1 mx-auto grid max-w-(--lx-public-max) grid-cols-1 items-center gap-8 px-(--lx-gutter) pt-12 md:grid-cols-[1fr_420px] md:gap-12 md:pt-20">
        <div>
          <h1 className="m-0 font-mono text-[clamp(56px,7vw,88px)] leading-[0.96] font-bold tracking-[-0.045em] text-text">
            GitHub
            <br />
            with a <span className="text-brand">map.</span>
          </h1>

          <p className="mt-7 max-w-115 font-sans text-[17px] leading-[1.55] text-text-muted">
            Discover what developers in your city are building. Like their
            projects. Star their repos. Follow the builders.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/sign-in"
              className="inline-flex min-h-11 items-center gap-2.5 rounded-[5px] border border-transparent bg-brand px-5.5 py-3.5 font-mono text-[13.5px] font-semibold text-brand-foreground no-underline shadow-card transition-colors hover:bg-brand/90 active:scale-[0.98]"
            >
              <BrandIcon name="github" size={16} />
              Sign in with GitHub
            </Link>
            <Link
              to="/sign-in"
              className="inline-flex min-h-11 items-center gap-2 rounded-card border border-line bg-transparent px-4.5 py-3.5 font-mono text-[13.5px] text-text-muted no-underline transition-colors hover:border-line-strong hover:bg-surface hover:text-text active:scale-[0.98]"
            >
              browse the feed <ArrowRight size={14} />
            </Link>
          </div>

          <div className="mt-5 font-mono text-[11.5px] text-text-faint">
            free · no spam · only public repo scope required
          </div>

          <button
            className="mt-2 border-0 bg-transparent p-0 font-mono text-[11.5px] text-text-faint"
            onClick={() =>
              document
                .getElementById('features')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
            type="button"
          >
            see how it works ↓
          </button>
        </div>

        {/* Preview card float — hidden on mobile */}
        <div className="relative hidden h-80 md:block">
          <div className="absolute top-5 left-5 right-3 h-45 rotate-[2.5deg] rounded-[6px] border border-line bg-surface opacity-40" />
          <div className="absolute top-9 inset-x-0 rotate-[-1.5deg] rounded-[6px] border border-line bg-surface px-5 py-4.5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="mb-1.5 font-mono text-[14.5px] font-semibold">
              <span className="font-normal text-text-faint">sonia/</span>
              wisp.tsx
            </div>
            <p className="mb-3 mt-0 font-sans text-[13px] leading-normal text-text-muted">
              Tiny React state primitive — signals without the ceremony.
            </p>
            <div className="flex gap-4 font-mono text-[11.5px] text-text-faint">
              <span className="flex items-center gap-1">
                <Star size={11} strokeWidth={1.4} /> 8.1k
              </span>
              <span className="flex items-center gap-1 text-brand">
                <Heart size={11} fill="currentColor" strokeWidth={1.4} /> 612
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare size={11} strokeWidth={1.4} /> 48
              </span>
            </div>
          </div>
          <div className="absolute top-2 right-6 flex rotate-[4deg] items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-brand shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
            <Heart size={11} fill="currentColor" /> +12
          </div>
        </div>
      </section>

      {/* Feature row */}
      <section
        id="features"
        className="relative z-1 mx-auto mt-16 grid max-w-296 grid-cols-1 gap-5 border-y border-line px-(--lx-gutter) py-10 md:grid-cols-3 md:gap-0 md:px-0"
      >
        {[
          {
            num: '01',
            title: 'discover',
            desc: 'See projects shipped by people in your city, your stack, your tier of weird.',
            Icon: MapPin,
          },
          {
            num: '02',
            title: 'like & star',
            desc: 'A heart for taste, a star for code. Both signals matter — they go to different places.',
            Icon: Heart,
          },
          {
            num: '03',
            title: 'connect',
            desc: 'Follow builders whose work you admire. Their next push shows up at the top of your feed.',
            Icon: ArrowRight,
          },
        ].map((f, i) => (
          <div
            key={i}
            className={cn(
              'px-0 py-2 md:px-8',
              i > 0 && 'border-t border-line md:border-l md:border-t-0',
            )}
          >
            <div className="mb-3.5 font-mono text-[11px] text-text-faint">
              {f.num}
            </div>
            <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-control border border-line text-brand">
              <f.Icon size={18} strokeWidth={1.4} />
            </div>
            <h3 className="mb-2 mt-0 font-mono text-lg font-semibold tracking-[-0.01em] text-text">
              {f.title}
            </h3>
            <p className="m-0 max-w-70 font-sans text-sm leading-[1.55] text-text-muted">
              {f.desc}
            </p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="px-(--lx-gutter) py-7 text-center font-mono text-[11.5px] text-text-faint">
        <div>built with love for developers.</div>
        <div className="mt-2 opacity-70">
          locatic · {new Date().getFullYear()} · made in 7 cities
        </div>
      </footer>
    </div>
  )
}
