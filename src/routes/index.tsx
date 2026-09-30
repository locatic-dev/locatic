import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { PublicHeader } from '@/components/app-shell/public-header'
import { PublicFooter } from '@/components/app-shell/public-footer'
import { HeroCopy } from '@/features/landing/hero-copy'
import { HeroMapCaption } from '@/features/landing/hero-map-caption'
import {
  getLandingCityDots,
  getLandingMap,
  getPingSequence,
  getShowcaseCityIds,
} from '@/features/landing/landing-content'
import { PingMap } from '@/features/landing/ping-map'
import { FeatureRow } from '@/features/landing/feature-row'
import { viewerQueryOptions } from '@/features/viewer/queries'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import {
  citiesByIdsQueryOptions,
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
  // The public queries render on the server. `prefetchQuery` never throws:
  // if one fails, the landing still renders with its labelled examples.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(landingMapCitiesQueryOptions()),
      context.queryClient.prefetchQuery(landingShowcaseQueryOptions()),
    ])
    // The ping cards place showcase projects on their owners' cities.
    const cityIds = getShowcaseCityIds(
      context.queryClient.getQueryData(landingShowcaseQueryOptions().queryKey),
    )
    if (cityIds.length > 0) {
      await context.queryClient.prefetchQuery(citiesByIdsQueryOptions(cityIds))
    }
  },
  component: LandingPage,
})

function LandingPage() {
  const { data: mapCities } = useQuery(landingMapCitiesQueryOptions())
  const { data: showcase } = useQuery(landingShowcaseQueryOptions())
  // A live showcase update changes the id list, and so the query key: keep the
  // previous cities until the new list loads so the pings do not drop to the
  // city top-ups and back. Extra cities are harmless; pings only use the ones
  // a current showcase owner names.
  const { data: showcaseCities } = useQuery({
    ...citiesByIdsQueryOptions(getShowcaseCityIds(showcase)),
    placeholderData: keepPreviousData,
  })
  const map = getLandingMap(mapCities)
  const pingItems = getPingSequence({
    map,
    showcase: showcase ?? [],
    cities: showcaseCities ?? [],
  })

  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-text">
      <PublicHeader />

      <main id="main-content" tabIndex={-1}>
        <section className="mx-auto max-w-(--lx-public-max) px-(--lx-gutter) pt-16 md:pt-24">
          <HeroCopy />
        </section>

        <section
          aria-label="builders on the map"
          className="relative mt-10 md:mt-14"
        >
          <PingMap items={pingItems} cityDots={getLandingCityDots(map)} />
          <div className="mx-auto max-w-(--lx-public-max) px-(--lx-gutter)">
            <HeroMapCaption map={map} />
          </div>
        </section>

        <FeatureRow />
      </main>

      <PublicFooter />
    </div>
  )
}
