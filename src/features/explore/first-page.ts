import { convexQuery } from '@convex-dev/react-query'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { PaginationResult } from 'convex/server'
import type { PaginationStatus } from 'convex/react'
import { useEffect } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { EXPLORE_PAGINATED_PAGE_SIZE } from './pagination'
import type { ExploreFilters, ExploreMode, ExploreScope } from './state'

// Explore's feeds use Convex `usePaginatedQuery`, which never runs on the
// server, so signed-out HTML would carry no projects, builders or posts. The
// route loader prefetches the visitor's first page as an ordinary query, and
// `useFirstPageSeed` shows it until the live paginated query answers. Server
// HTML and the first client render then match, and crawlers get real links.

type CityIds = Array<Id<'cities'>>

/** Arguments of the project feed (`explore.list` / `explore.listPublic`). */
export function getProjectFeedArgs({
  cityIds,
  filters,
  scope,
}: {
  cityIds: CityIds
  filters: ExploreFilters
  scope: ExploreScope
}) {
  return {
    scope,
    selectedCityIds: cityIds,
    ...(filters.language ? { language: filters.language } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
  }
}

/** Arguments of the builder feed (`explore.listNearbyBuilders*`). */
export function getBuilderFeedArgs({
  cityIds,
  filters,
}: {
  cityIds: CityIds
  filters: ExploreFilters
}) {
  return {
    cityIds,
    ...(filters.openToCollab ? { openToCollab: true } : {}),
  }
}

/** Arguments of the post feed (`explore.listPosts*`). */
export function getPostFeedArgs({
  cityIds,
  scope,
}: {
  cityIds: CityIds
  scope: ExploreScope
}) {
  return { scope, selectedCityIds: cityIds }
}

const firstPage = { numItems: EXPLORE_PAGINATED_PAGE_SIZE, cursor: null }

/** The visitor's first page of the public projects feed, as a plain query. */
export const publicProjectsFirstPageQueryOptions = (
  args: ReturnType<typeof getProjectFeedArgs>,
) => convexQuery(api.explore.listPublic, { ...args, paginationOpts: firstPage })

/** The visitor's first page of the public builders feed. */
export const publicBuildersFirstPageQueryOptions = (
  args: ReturnType<typeof getBuilderFeedArgs>,
) =>
  convexQuery(api.explore.listNearbyBuildersPublic, {
    ...args,
    paginationOpts: firstPage,
  })

/** The visitor's first page of the public posts feed. */
export const publicPostsFirstPageQueryOptions = (
  args: ReturnType<typeof getPostFeedArgs>,
) =>
  convexQuery(api.explore.listPostsPublic, {
    ...args,
    paginationOpts: firstPage,
  })

/**
 * Prefetches the first page the visitor feed of `mode` reads. Like every
 * `prefetchQuery`, it never throws: a failure leaves the feed to the client.
 */
export function prefetchVisitorFirstPage(
  queryClient: QueryClient,
  {
    cityIds,
    filters,
    mode,
    scope,
  }: {
    cityIds: CityIds
    filters: ExploreFilters
    mode: ExploreMode
    scope: ExploreScope
  },
): Promise<void> {
  switch (mode) {
    case 'builders':
      return queryClient.prefetchQuery(
        publicBuildersFirstPageQueryOptions(
          getBuilderFeedArgs({ cityIds, filters }),
        ),
      )
    case 'posts':
      return queryClient.prefetchQuery(
        publicPostsFirstPageQueryOptions(getPostFeedArgs({ cityIds, scope })),
      )
    case 'projects':
    default:
      return queryClient.prefetchQuery(
        publicProjectsFirstPageQueryOptions(
          getProjectFeedArgs({ cityIds, filters, scope }),
        ),
      )
  }
}

type PaginatedFeed = {
  isLoading: boolean
  results: unknown[]
  status: PaginationStatus
}

/**
 * While `paged` loads its first page, returns it with the prefetched page
 * (`seed`, null when no seed applies) as its results, in the `LoadingMore`
 * state: the rows are shown and the feed waits for the live page before it
 * paginates. Once the live page arrives the seed is dropped from the cache,
 * which also ends the Convex subscription the hydrated query opened.
 */
export function useFirstPageSeed<TFeed extends PaginatedFeed>(
  paged: TFeed,
  seed: { queryKey: readonly unknown[] } | null,
): TFeed {
  const queryClient = useQueryClient()
  const seedPage = seed
    ? queryClient.getQueryData<PaginationResult<unknown>>(seed.queryKey)
    : undefined
  const waiting = paged.status === 'LoadingFirstPage'
  // Query options are rebuilt every render; the serialized key is stable.
  const seedKeyJson = seed ? JSON.stringify(seed.queryKey) : null
  const hasSeedPage = seedPage !== undefined

  useEffect(() => {
    if (!waiting && seedKeyJson && hasSeedPage) {
      queryClient.removeQueries({
        queryKey: JSON.parse(seedKeyJson) as unknown[],
        exact: true,
      })
    }
  }, [hasSeedPage, queryClient, seedKeyJson, waiting])

  if (!waiting || !seedPage || seedPage.page.length === 0) {
    return paged
  }
  return {
    ...paged,
    isLoading: true,
    results: seedPage.page,
    status: 'LoadingMore',
  }
}
