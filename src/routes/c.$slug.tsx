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
import { CityPageView } from '@/features/city/city-sections'
import { cityPageQueryOptions } from '@/features/city/queries'
import { VisitorCityFrame } from '@/features/city/visitor-city-frame'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'
import { notFoundSeo, seo } from '@/lib/seo'

/**
 * Public city page (plan item D5). Visitors get the public header; members
 * get the app shell, and members who still need onboarding go there first
 * with this URL as the destination, as on Explore. Unknown and inactive
 * cities are a real 404. A city id in the address (city pills link by id)
 * redirects to the city's slug.
 */
export const Route = createFileRoute('/c/$slug')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      return
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

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
      throw redirect({
        to: '/c/$slug',
        params: { slug: page.city.slug },
        replace: true,
      })
    }
    return {
      name: page.city.name,
      displayName: page.city.displayName,
      slug: page.city.slug,
    }
  },
  // The root head sees a stale matches snapshot, so this route reports its
  // own notFoundComponent from its fresh match.
  head: ({ match, loaderData }) =>
    match.status === 'notFound'
      ? notFoundSeo()
      : loaderData
        ? seo({
            title: loaderData.name,
            description: `What builders in ${loaderData.displayName} are working on: recent public projects, builders and posts.`,
            path: `/c/${loaderData.slug}`,
          })
        : {},
  pendingComponent: FeedRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  notFoundComponent: CityNotFound,
  component: CityRoute,
})

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
  const { data: page } = useSuspenseQuery(cityPageQueryOptions(slug))

  return (
    <CityFrame>
      {/* The loader 404s; this covers a city that goes inactive while open. */}
      {page ? <CityPageView page={page} /> : <CityNotFoundContent />}
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
