import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { DotMap } from '@/components/ui/dot-map'
import { PublicHeader } from '@/components/app-shell/public-header'
import { PublicFooter } from '@/components/app-shell/public-footer'
import { HeroCopy } from '@/features/landing/hero-copy'
import { HeroMapCaption } from '@/features/landing/hero-map-caption'
import { getLandingMap } from '@/features/landing/landing-content'
import { RepoPreviewCard } from '@/features/landing/repo-preview-card'
import { FeatureRow } from '@/features/landing/feature-row'
import { DotMapParallax } from '@/features/landing/dot-map-parallax'
import { viewerQueryOptions } from '@/features/viewer/queries'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import {
  landingMapCitiesQueryOptions,
  landingShowcaseQueryOptions,
} from '@/integrations/convex/query-options'

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
  // Both public queries render on the server. `prefetchQuery` never throws:
  // if either fails, the landing still renders with its labelled examples.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(landingMapCitiesQueryOptions()),
      context.queryClient.prefetchQuery(landingShowcaseQueryOptions()),
    ])
  },
  component: LandingPage,
})

function LandingPage() {
  const { data: mapCities } = useQuery(landingMapCitiesQueryOptions())
  const { data: showcase } = useQuery(landingShowcaseQueryOptions())
  const map = getLandingMap(mapCities)

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-canvas text-text">
      <PublicHeader />

      {/* Dot map background: cities with builders, or the example pins */}
      <DotMapParallax className="pointer-events-none absolute top-16 inset-x-0 flex h-130 justify-center opacity-60">
        <div
          style={{
            maskImage:
              'radial-gradient(ellipse at center, black 40%, transparent 75%)',
            WebkitMaskImage:
              'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          }}
        >
          <DotMap
            width={1200}
            height={520}
            points={map.kind === 'cities' ? map.points : undefined}
          />
        </div>
      </DotMapParallax>

      <main id="main-content" tabIndex={-1}>
        {/* Hero */}
        <section className="relative z-1 mx-auto grid max-w-(--lx-public-max) grid-cols-1 items-center gap-8 px-(--lx-gutter) pt-12 md:grid-cols-[1fr_420px] md:gap-12 md:pt-20">
          <div>
            <HeroCopy />
            <HeroMapCaption map={map} />
          </div>

          <RepoPreviewCard projects={showcase ?? []} />
        </section>

        <FeatureRow />
      </main>

      <PublicFooter />
    </div>
  )
}
