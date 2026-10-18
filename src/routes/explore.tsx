import type { QueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  redirect,
  stripSearchParams,
} from '@tanstack/react-router'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import {
  FeedRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import {
  mapViewerExplorePrefs,
  type ViewerBootstrapPayload,
  type ViewerExplorePrefsPayload,
} from '@/features/contracts'
import { ExplorePage } from '@/features/explore/explore-page'
import { prefetchVisitorFirstPage } from '@/features/explore/first-page'
import {
  EXPLORE_SEARCH_DEFAULTS,
  deriveDefaultExploreCityIds,
  getCanonicalExploreCityIds,
  getExploreLoaderDeps,
  getExploreProjectCityIds,
  getNearbyBuilderCityIds,
  normalizeExploreSearch,
  type ExploreSearch,
} from '@/features/explore/state'
import { citiesByIdsQueryOptions } from '@/features/cities/queries'
import { cityStatsQueryOptions } from '@/features/explore/queries'
import { followingQueryOptions } from '@/features/follows/queries'
import {
  viewerExplorePrefsQueryOptions,
  viewerLikedProjectIdsQueryOptions,
  viewerQueryOptions,
} from '@/features/viewer/queries'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'
import { seo } from '@/lib/seo'

/**
 * The rail's city card reads one city's stats; prefetch them when exactly one
 * city is selected. `prefetchQuery` never throws, so a failure only leaves
 * the card to load on the client.
 */
function prefetchRailCityStats(
  queryClient: QueryClient,
  selectedCityIds: Array<Id<'cities'>>,
) {
  const [onlyCityId] = selectedCityIds
  return selectedCityIds.length === 1 && onlyCityId
    ? queryClient.prefetchQuery(cityStatsQueryOptions(onlyCityId))
    : Promise.resolve()
}

/**
 * Explore is public. Signed-in members get the app shell and personal feeds;
 * visitors get public queries, and members who still need onboarding keep this
 * URL as their return destination.
 */
export const Route = createFileRoute('/explore')({
  validateSearch: normalizeExploreSearch,
  // Default values stay out of hrefs, so /explore renders at its canonical
  // URL instead of redirecting to a parameterized copy of itself.
  search: {
    middlewares: [
      stripSearchParams<ExploreSearch, ExploreSearch>(EXPLORE_SEARCH_DEFAULTS),
    ],
  },
  loaderDeps: ({ search }) => getExploreLoaderDeps(search),
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
  loader: async ({ context, deps }) => {
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    if (!context.auth.isAuthenticated) {
      const selectedCityIds = getExploreProjectCityIds(deps, []) as Array<
        Id<'cities'>
      >
      let cityIds = selectedCityIds
      if (selectedCityIds.length > 0) {
        const [cities] = await Promise.all([
          context.queryClient.ensureQueryData(
            citiesByIdsQueryOptions(selectedCityIds),
          ),
          prefetchRailCityStats(context.queryClient, selectedCityIds),
        ])
        // The page queries the canonical ids once the cities have loaded;
        // the first page must use the same arguments to be picked up.
        cityIds = getCanonicalExploreCityIds(
          selectedCityIds,
          cities as Array<Doc<'cities'>>,
          { dropUnresolved: true },
        ) as Array<Id<'cities'>>
      }
      // The visitor feed's first page, so server HTML lists real projects,
      // builders or posts (first-page.ts). A failure leaves the feed to load
      // on the client.
      await prefetchVisitorFirstPage(context.queryClient, {
        cityIds:
          deps.mode === 'builders'
            ? (getNearbyBuilderCityIds({
                scope: deps.scope,
                selectedCityIds: cityIds,
              }) as Array<Id<'cities'>>)
            : cityIds,
        filters: deps.filters,
        mode: deps.mode,
        scope: deps.scope,
      })
      return
    }

    const [explorePrefsData] = await Promise.all([
      context.queryClient.ensureQueryData(viewerExplorePrefsQueryOptions()),
      context.queryClient.ensureQueryData(viewerLikedProjectIdsQueryOptions()),
    ])
    const explorePrefs = mapViewerExplorePrefs(
      explorePrefsData as ViewerExplorePrefsPayload | undefined,
    )
    if (!explorePrefs) {
      return
    }

    const selectedCityIds = getExploreProjectCityIds(
      deps,
      deriveDefaultExploreCityIds(explorePrefs),
    ) as Array<Id<'cities'>>

    await Promise.all([
      context.queryClient.ensureQueryData(
        followingQueryOptions(explorePrefs.viewerId),
      ),
      selectedCityIds.length > 0
        ? context.queryClient.ensureQueryData(
            citiesByIdsQueryOptions(selectedCityIds),
          )
        : Promise.resolve(),
      prefetchRailCityStats(context.queryClient, selectedCityIds),
    ])
  },
  pendingComponent: FeedRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  head: () =>
    seo({
      title: 'Explore developer projects by city',
      description:
        'Browse public projects, releases and builders by city and tech stack, from your city to anywhere on the globe.',
      path: '/explore',
    }),
  component: ExplorePage,
})
