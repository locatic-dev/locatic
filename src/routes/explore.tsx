import { createFileRoute, redirect } from '@tanstack/react-router'
import type { Id } from '../../convex/_generated/dataModel'
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
import {
  deriveDefaultExploreCityIds,
  getExploreLoaderDeps,
  getExploreProjectCityIds,
  normalizeExploreSearch,
} from '@/features/explore/state'
import { citiesByIdsQueryOptions } from '@/features/cities/queries'
import { followingQueryOptions } from '@/features/follows/queries'
import {
  viewerExplorePrefsQueryOptions,
  viewerLikedProjectIdsQueryOptions,
  viewerQueryOptions,
} from '@/features/viewer/queries'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'

/**
 * Explore is public. Signed-in members get the app shell and personal feeds;
 * visitors get public queries, and members who still need onboarding keep this
 * URL as their return destination.
 */
export const Route = createFileRoute('/explore')({
  validateSearch: normalizeExploreSearch,
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
      if (selectedCityIds.length > 0) {
        await context.queryClient.ensureQueryData(
          citiesByIdsQueryOptions(selectedCityIds),
        )
      }
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
    ])
  },
  pendingComponent: FeedRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: ExplorePage,
})
