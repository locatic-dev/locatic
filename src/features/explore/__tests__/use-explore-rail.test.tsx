// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import { EXPLORE_AUTO_FETCH_LIMIT } from '../feed-state'
import { EXPLORE_PAGINATED_PAGE_SIZE } from '../pagination'
import { RAIL_BUILDER_LIMIT, useExploreRail } from '../use-explore-rail'

const mocks = vi.hoisted(() => ({
  queryResults: new Map<string, { data?: unknown; isError?: boolean }>(),
  queryArgs: [] as Array<{ fn: string; args: unknown }>,
  paginatedCalls: [] as Array<{
    fn: string
    args: unknown
    options: { initialNumItems: number }
  }>,
  paginatedResults: new Map<string, unknown[]>(),
  paginatedStatus: 'Exhausted' as string,
  loadMore: vi.fn(),
}))

vi.mock('../../../../convex/_generated/api', () => ({
  api: {
    cities: {
      getStats: { name: 'cities:getStats' },
      listNearby: { name: 'cities:listNearby' },
    },
    explore: {
      listNearbyBuilders: { name: 'explore:listNearbyBuilders' },
      listNearbyBuildersPublic: { name: 'explore:listNearbyBuildersPublic' },
    },
  },
}))

vi.mock('@convex-dev/react-query', () => ({
  convexQuery: (fn: { name: string }, args: unknown) => ({
    queryKey: [fn.name, args],
    fn: fn.name,
    args,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { fn: string; args: unknown }) => {
    mocks.queryArgs.push({ fn: options.fn, args: options.args })
    return (
      mocks.queryResults.get(options.fn) ?? { data: undefined, isError: false }
    )
  },
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: (
    fn: { name: string },
    args: unknown,
    options: { initialNumItems: number },
  ) => {
    mocks.paginatedCalls.push({ fn: fn.name, args, options })
    return args === 'skip'
      ? { results: [], status: 'LoadingFirstPage', loadMore: vi.fn() }
      : {
          results: mocks.paginatedResults.get(fn.name) ?? [],
          status: mocks.paginatedStatus,
          loadMore: mocks.loadMore,
        }
  },
}))

const CITY = 'city_hyd' as Id<'cities'>

function callFor(calls: Array<{ fn: string; args: unknown }>, fn: string) {
  return calls.filter((call) => call.fn === fn).at(-1)?.args
}

describe('useExploreRail', () => {
  beforeEach(() => {
    mocks.queryResults.clear()
    mocks.queryArgs.length = 0
    mocks.paginatedCalls.length = 0
    mocks.paginatedResults.clear()
    mocks.paginatedStatus = 'Exhausted'
    mocks.loadMore.mockReset()
  })

  it('reads stats, nearby cities and member builders for one city', () => {
    mocks.queryResults.set('cities:getStats', {
      data: { builderCount: 3, projectCount: 4, lastActivityAt: null },
    })
    mocks.queryResults.set('cities:listNearby', {
      data: [{ cityId: 'city_blr', name: 'Bengaluru' }],
    })

    const { result } = renderHook(() =>
      useExploreRail({
        isVisitor: false,
        mode: 'projects',
        railCityId: CITY,
        builderCityIds: [CITY],
      }),
    )

    expect(callFor(mocks.queryArgs, 'cities:getStats')).toEqual({
      cityId: CITY,
    })
    expect(callFor(mocks.queryArgs, 'cities:listNearby')).toEqual({
      cityId: CITY,
    })
    expect(callFor(mocks.paginatedCalls, 'explore:listNearbyBuilders')).toEqual(
      { cityIds: [CITY] },
    )
    expect(
      callFor(mocks.paginatedCalls, 'explore:listNearbyBuildersPublic'),
    ).toBe('skip')
    expect(result.current.cityStats?.builderCount).toBe(3)
    expect(result.current.nearbyCities).toHaveLength(1)
  })

  it('skips stats and nearby cities without a single city', () => {
    const { result } = renderHook(() =>
      useExploreRail({
        isVisitor: false,
        mode: 'projects',
        railCityId: null,
        builderCityIds: [],
      }),
    )

    expect(callFor(mocks.queryArgs, 'cities:getStats')).toBe('skip')
    expect(callFor(mocks.queryArgs, 'cities:listNearby')).toBe('skip')
    expect(result.current.cityStats).toBeNull()
    expect(result.current.nearbyCities).toEqual([])
  })

  it('skips builders in builders mode, where the feed lists them', () => {
    renderHook(() =>
      useExploreRail({
        isVisitor: false,
        mode: 'builders',
        railCityId: CITY,
        builderCityIds: [CITY],
      }),
    )

    expect(callFor(mocks.paginatedCalls, 'explore:listNearbyBuilders')).toBe(
      'skip',
    )
    expect(
      callFor(mocks.paginatedCalls, 'explore:listNearbyBuildersPublic'),
    ).toBe('skip')
  })

  it('uses the public builder query for visitors and caps the list', () => {
    mocks.paginatedResults.set(
      'explore:listNearbyBuildersPublic',
      Array.from({ length: 8 }, (_, index) => ({ userId: `user_${index}` })),
    )

    const { result } = renderHook(() =>
      useExploreRail({
        isVisitor: true,
        mode: 'posts',
        railCityId: null,
        builderCityIds: [],
      }),
    )

    expect(callFor(mocks.paginatedCalls, 'explore:listNearbyBuilders')).toBe(
      'skip',
    )
    expect(
      callFor(mocks.paginatedCalls, 'explore:listNearbyBuildersPublic'),
    ).toEqual({ cityIds: [] })
    expect(result.current.nearbyBuilders).toHaveLength(RAIL_BUILDER_LIMIT)
  })

  it('shows no nearby cities when the query fails (not yet deployed)', () => {
    mocks.queryResults.set('cities:listNearby', {
      data: undefined,
      isError: true,
    })

    const { result } = renderHook(() =>
      useExploreRail({
        isVisitor: true,
        mode: 'projects',
        railCityId: CITY,
        builderCityIds: [CITY],
      }),
    )

    expect(result.current.nearbyCities).toEqual([])
  })
})

describe('useExploreRail builder fill', () => {
  const VIEWER_FN = 'explore:listNearbyBuilders'
  const OTHER_CITY = 'city_blr' as Id<'cities'>

  function builders(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      userId: `user_${index}`,
    }))
  }

  function renderRail(cityIds: Array<Id<'cities'>> = [CITY]) {
    return renderHook(
      ({ builderCityIds }) =>
        useExploreRail({
          isVisitor: false,
          mode: 'projects',
          railCityId: builderCityIds.length === 1 ? builderCityIds[0] : null,
          builderCityIds,
        }),
      { initialProps: { builderCityIds: cityIds } },
    )
  }

  /** One loadMore round trip: LoadingMore, then a settled page. */
  function settle(
    rerender: (props: { builderCityIds: Array<Id<'cities'>> }) => void,
    builderCityIds: Array<Id<'cities'>> = [CITY],
  ) {
    mocks.paginatedStatus = 'LoadingMore'
    rerender({ builderCityIds })
    mocks.paginatedStatus = 'CanLoadMore'
    rerender({ builderCityIds })
  }

  beforeEach(() => {
    mocks.paginatedCalls.length = 0
    mocks.paginatedResults.clear()
    mocks.loadMore.mockReset()
    mocks.paginatedStatus = 'CanLoadMore'
  })

  it('reads raw pages the size of the feed', () => {
    renderRail()

    expect(
      mocks.paginatedCalls.find((call) => call.fn === VIEWER_FN)?.options,
    ).toEqual({ initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE })
  })

  it('loads the next page after an empty page with more to read', () => {
    mocks.paginatedResults.set(VIEWER_FN, [])
    renderRail()

    expect(mocks.loadMore).toHaveBeenCalledTimes(1)
    expect(mocks.loadMore).toHaveBeenCalledWith(EXPLORE_PAGINATED_PAGE_SIZE)
  })

  it('loads the next page after a short page', () => {
    mocks.paginatedResults.set(VIEWER_FN, builders(2))
    const { result } = renderRail()

    expect(mocks.loadMore).toHaveBeenCalledTimes(1)
    expect(result.current.nearbyBuilders).toHaveLength(2)
  })

  it('stops once the list is full', () => {
    mocks.paginatedResults.set(VIEWER_FN, builders(RAIL_BUILDER_LIMIT))
    renderRail()

    expect(mocks.loadMore).not.toHaveBeenCalled()
  })

  it('does not load more once the query is exhausted', () => {
    mocks.paginatedResults.set(VIEWER_FN, builders(1))
    mocks.paginatedStatus = 'Exhausted'
    renderRail()

    expect(mocks.loadMore).not.toHaveBeenCalled()
  })

  it('waits while a page is loading', () => {
    mocks.paginatedStatus = 'LoadingFirstPage'
    const { rerender } = renderRail()
    mocks.paginatedStatus = 'LoadingMore'
    rerender({ builderCityIds: [CITY] })

    expect(mocks.loadMore).not.toHaveBeenCalled()
  })

  it(`stops after ${EXPLORE_AUTO_FETCH_LIMIT} automatic fetches`, () => {
    mocks.paginatedResults.set(VIEWER_FN, [])
    const { rerender } = renderRail()
    for (let round = 0; round < EXPLORE_AUTO_FETCH_LIMIT + 2; round += 1) {
      settle(rerender)
    }

    expect(mocks.loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT)
  })

  it('starts a new budget when the cities change', () => {
    mocks.paginatedResults.set(VIEWER_FN, [])
    const { rerender } = renderRail()
    for (let round = 0; round < EXPLORE_AUTO_FETCH_LIMIT; round += 1) {
      settle(rerender)
    }
    expect(mocks.loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT)

    rerender({ builderCityIds: [OTHER_CITY] })

    expect(mocks.loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT + 1)
  })
})
