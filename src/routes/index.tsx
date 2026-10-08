import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { PublicHeader } from '@/components/app-shell/public-header'
import { PublicFooter } from '@/components/app-shell/public-footer'
import { HeroActivityList } from '@/features/landing/hero-activity-list'
import { HeroCopy } from '@/features/landing/hero-copy'
import { HeroMapCaption } from '@/features/landing/hero-map-caption'
import {
  getLandingCityDots,
  getLandingMap,
  getPingSequence,
} from '@/features/landing/landing-content'
import { PingGlobe } from '@/features/landing/ping-globe'
import { FeatureRow } from '@/features/landing/feature-row'
import { viewerQueryOptions } from '@/features/viewer/queries'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import {
  landingActivityQueryOptions,
  landingMapCitiesQueryOptions,
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
  // The public queries render on the server. `prefetchQuery` never throws:
  // if one fails, the landing still renders, with nothing pinged.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(landingMapCitiesQueryOptions()),
      context.queryClient.prefetchQuery(landingActivityQueryOptions()),
    ])
  },
  component: LandingPage,
})

/** The caption describes the decorative globe's region. */
const HERO_MAP_CAPTION_ID = 'hero-map-caption'

function LandingPage() {
  const { data: mapCities } = useQuery(landingMapCitiesQueryOptions())
  const { data: activity } = useQuery(landingActivityQueryOptions())
  const map = getLandingMap(mapCities)
  const pingItems = getPingSequence(activity)

  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-text">
      <PublicHeader />

      <main id="main-content" tabIndex={-1}>
        {/* Two columns from lg: the copy beside the globe. Below lg the globe
            sits under the calls to action. */}
        <div className="mx-auto grid max-w-(--lx-public-max) items-center gap-x-10 px-(--lx-gutter) pt-16 md:pt-24 lg:grid-cols-2 lg:pt-12">
          <HeroCopy />
          <section
            aria-label="recent activity on the map"
            aria-describedby={HERO_MAP_CAPTION_ID}
            className="mx-auto mt-10 w-full max-w-105 md:mt-14 lg:mt-0 lg:max-w-none"
          >
            <PingGlobe items={pingItems} cityDots={getLandingCityDots(map)} />
            <HeroActivityList items={pingItems} />
          </section>
        </div>
        <div className="mx-auto max-w-(--lx-public-max) px-(--lx-gutter)">
          <HeroMapCaption id={HERO_MAP_CAPTION_ID} map={map} />
        </div>

        <FeatureRow />
      </main>

      <PublicFooter />
    </div>
  )
}
