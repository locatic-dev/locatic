import { useQuery } from '@tanstack/react-query'
import { usePaginatedQuery, type PaginationStatus } from 'convex/react'
import { useEffect, useRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  cityStatsQueryOptions,
  nearbyCitiesQueryOptions,
} from '@/features/explore/queries'
import { EXPLORE_AUTO_FETCH_LIMIT } from '@/features/explore/feed-state'
import { EXPLORE_PAGINATED_PAGE_SIZE } from '@/features/explore/pagination'
import type { ExploreMode } from '@/features/explore/state'
import type { BuilderPreview } from '@/features/explore/types'

/**
 * Builders the rail's "active nearby" list ("active builders" without a
 * city) and the empty-city state show.
 */
export const RAIL_BUILDER_LIMIT = 5

export type ExploreRailCityStats = NonNullable<
  FunctionReturnType<typeof api.cities.getStats>
>
export type ExploreRailNearbyCity = FunctionReturnType<
  typeof api.cities.listNearby
>[number]

/**
 * The Explore rail's data, read once in `ExploreView` whether the rail or the
 * filter sheet shows it. City stats and nearby cities need exactly one city
 * (`railCityId`); the builder list is skipped in builders mode, where the
 * feed already lists them. `nearbyCities` is empty while loading and when the
 * query fails (a deployment without `cities.listNearby`), so the rail hides
 * that block rather than showing an error.
 */
export function useExploreRail({
  isVisitor,
  mode,
  railCityId,
  builderCityIds,
}: {
  isVisitor: boolean
  mode: ExploreMode
  /** Exactly one selected city, else null (global or several cities). */
  railCityId: Id<'cities'> | null
  builderCityIds: Array<Id<'cities'>>
}) {
  const cityStatsQuery = useQuery(cityStatsQueryOptions(railCityId))
  const nearbyCitiesQuery = useQuery(nearbyCitiesQueryOptions(railCityId))
  const builderArgs =
    mode === 'builders' ? ('skip' as const) : { cityIds: builderCityIds }
  // Builder pages are filtered after the read (see useRailBuilderFill), so
  // request raw pages the size of the feed's, not RAIL_BUILDER_LIMIT.
  const viewerBuilders = usePaginatedQuery(
    api.explore.listNearbyBuilders,
    isVisitor ? 'skip' : builderArgs,
    { initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE },
  )
  const publicBuilders = usePaginatedQuery(
    api.explore.listNearbyBuildersPublic,
    isVisitor ? builderArgs : 'skip',
    { initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE },
  )
  const builders = isVisitor ? publicBuilders : viewerBuilders
  useRailBuilderFill(
    builders,
    builderArgs === 'skip'
      ? null
      : `${isVisitor ? 'public' : 'viewer'}:${builderCityIds.join(',')}`,
  )

  return {
    cityStats: railCityId
      ? ((cityStatsQuery.data as ExploreRailCityStats | null | undefined) ??
        null)
      : null,
    nearbyCities:
      railCityId && !nearbyCitiesQuery.isError
        ? ((nearbyCitiesQuery.data as ExploreRailNearbyCity[] | undefined) ??
          [])
        : [],
    nearbyBuilders: (builders.results as BuilderPreview[]).slice(
      0,
      RAIL_BUILDER_LIMIT,
    ),
  }
}

/**
 * `listNearbyBuilders*` filter each raw page after reading it (removed and
 * hidden accounts, the viewer, city membership), so a page can come back
 * short or empty while more builders exist. Until the list holds
 * RAIL_BUILDER_LIMIT builders, fetch the next page, at most
 * EXPLORE_AUTO_FETCH_LIMIT times per result set (`resetKey`, null when
 * skipped).
 */
function useRailBuilderFill(
  {
    loadMore,
    results,
    status,
  }: {
    loadMore: (numItems: number) => void
    results: unknown[]
    status: PaginationStatus
  },
  resetKey: string | null,
) {
  const autoFetches = useRef({ key: resetKey, count: 0 })
  const loadedCount = results.length

  useEffect(() => {
    if (autoFetches.current.key !== resetKey) {
      autoFetches.current = { key: resetKey, count: 0 }
    }
    if (
      resetKey === null ||
      status !== 'CanLoadMore' ||
      loadedCount >= RAIL_BUILDER_LIMIT ||
      autoFetches.current.count >= EXPLORE_AUTO_FETCH_LIMIT
    ) {
      return
    }
    autoFetches.current.count += 1
    loadMore(EXPLORE_PAGINATED_PAGE_SIZE)
  }, [loadMore, loadedCount, resetKey, status])
}
