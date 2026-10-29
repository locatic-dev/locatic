import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { MemberShell } from '@/components/app-shell/member-shell'
import {
  FeedRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { CityNotFoundContent } from '@/features/city/city-not-found'
import { describeCityPage } from '@/features/city/city-summary'
import { CityPageView } from '@/features/city/city-sections'
import { cityPageQueryOptions } from '@/features/city/queries'
import { VisitorCityFrame } from '@/features/city/visitor-city-frame'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'
import { notFoundSeo, seo, truncateDescription } from '@/lib/seo'
import { cityPageNode } from '@/lib/structured-data'
import { JsonLd } from '@/components/ui/json-ld'
import { getAccountRecoveryState } from '@/features/viewer/lifecycle'
import { isCityIndexable } from '../../convex/lib/seo_thresholds'

/**
 * Public city page. Visitors get the public header; members
 * get the app shell, and members who still need onboarding go there first
 * with this URL as the destination, as on Explore. Unknown and inactive
 * cities are a real 404. A city id in the address (stored snapshots only
 * carry the id) redirects permanently to the city's slug.
 */
export const Route = createFileRoute('/c/$slug')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      return
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    if (getAccountRecoveryState(bootstrap)) {
      throw redirect({
        to: '/sign-in/$',
        search: { redirect: toSafeRelativeUrl(location.href) ?? undefined },
      })
    }

    if (bootstrap.needsOnboarding) {
      throw redirect({
        to: '/onboarding',
        search: { redirect: toSafeRelativeUrl(location.href) ?? undefined },
      })
    }
  },
  loader: async ({ context, params }) => {
    const page = await context.queryClient.ensureQueryData(
      cityPageQueryOptions(params.slug),
    )
    if (!page) {
      throw notFound()
    }
    if (page.city.slug !== params.slug) {
      // Permanent: the slug is the city's canonical address, so search
      // engines should move any id link they found onto it.
      throw redirect({
        to: '/c/$slug',
        params: { slug: page.city.slug },
        replace: true,
        statusCode: 301,
      })
    }
    return {
      name: page.city.name,
      displayName: page.city.displayName,
      slug: page.city.slug,
      location: page.city.location,
      builderCount: page.stats.builderCount,
      summary: describeCityPage(page),
      projects: page.recentWork.projects.map(({ owner, repo, fullName }) => ({
        owner,
        repo,
        fullName,
      })),
    }
  },
  // The root head sees a stale matches snapshot, so this route reports its
  // own notFoundComponent from its fresh match.
  head: ({ match, loaderData }) =>
    match.status === 'notFound'
      ? notFoundSeo()
      : loaderData
        ? cityHead(loaderData)
        : {},
  pendingComponent: FeedRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  notFoundComponent: CityNotFound,
  component: CityRoute,
})

function cityHead(city: {
  builderCount: number
  name: string
  slug: string
  summary: string
}) {
  return seo({
    title: `Developers and projects in ${city.name}`,
    description: truncateDescription(city.summary),
    path: `/c/${city.slug}`,
    thin: !isCityIndexable(city),
  })
}

function CityFrame({ children }: { children: ReactNode }) {
  const { auth } = Route.useRouteContext()
  const visitor = <VisitorCityFrame>{children}</VisitorCityFrame>
  if (!auth.isAuthenticated) {
    return visitor
  }
  return (
    <MemberShell withoutViewer={visitor}>
      <div className="lx-page-scroll flex-1">{children}</div>
    </MemberShell>
  )
}

function CityRoute() {
  const { slug } = Route.useParams()
  const loaderData = Route.useLoaderData()
  const { data: page } = useSuspenseQuery(cityPageQueryOptions(slug))

  return (
    <CityFrame>
      {/* The loader 404s; this covers a city that goes inactive while open. */}
      {page ? <CityPageView page={page} /> : <CityNotFoundContent />}
      {page && isCityIndexable(loaderData) && (
        <JsonLd nodes={cityPageNode(loaderData)} />
      )}
    </CityFrame>
  )
}

function CityNotFound() {
  return (
    <CityFrame>
      <CityNotFoundContent />
    </CityFrame>
  )
}
