// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { PaginationStatus } from 'convex/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'
import {
  getProjectFeedArgs,
  publicProjectsFirstPageQueryOptions,
  useFirstPageSeed,
} from '../first-page'

const args = getProjectFeedArgs({
  cityIds: [],
  filters: {},
  scope: 'default',
})
const seed = publicProjectsFirstPageQueryOptions(args)

function setup(seedPage: unknown[] | null) {
  const queryClient = new QueryClient()
  if (seedPage) {
    queryClient.setQueryData(seed.queryKey, {
      page: seedPage,
      isDone: false,
      continueCursor: 'cursor',
    })
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

function paged(status: PaginationStatus, results: unknown[] = []) {
  return { isLoading: status === 'LoadingFirstPage', results, status }
}

describe('getProjectFeedArgs', () => {
  it('adds only the filters that are set', () => {
    expect(
      getProjectFeedArgs({
        cityIds: ['city_1' as Id<'cities'>],
        filters: { language: 'go' },
        scope: 'custom',
      }),
    ).toEqual({ scope: 'custom', selectedCityIds: ['city_1'], language: 'go' })
  })
})

describe('useFirstPageSeed', () => {
  it('shows the prefetched page while the live first page loads', () => {
    const { wrapper } = setup([{ id: 'a' }])
    const { result } = renderHook(
      () => useFirstPageSeed(paged('LoadingFirstPage'), seed),
      { wrapper },
    )
    expect(result.current.results).toEqual([{ id: 'a' }])
    // Waits for the live page before paginating.
    expect(result.current.status).toBe('LoadingMore')
  })

  it('passes the live feed through and drops the seed once it answers', () => {
    const { queryClient, wrapper } = setup([{ id: 'a' }])
    const { result, rerender } = renderHook(
      ({ feed }) => useFirstPageSeed(feed, seed),
      { wrapper, initialProps: { feed: paged('LoadingFirstPage') } },
    )
    rerender({ feed: paged('CanLoadMore', [{ id: 'b' }]) })
    expect(result.current.results).toEqual([{ id: 'b' }])
    expect(result.current.status).toBe('CanLoadMore')
    expect(queryClient.getQueryData(seed.queryKey)).toBeUndefined()
  })

  it('keeps loading without a seed or with an empty one', () => {
    for (const seedPage of [null, []]) {
      const { wrapper } = setup(seedPage)
      const { result } = renderHook(
        () => useFirstPageSeed(paged('LoadingFirstPage'), seed),
        { wrapper },
      )
      expect(result.current.status).toBe('LoadingFirstPage')
    }
  })

  it('ignores a seed when the feed is skipped', () => {
    const { wrapper } = setup([{ id: 'a' }])
    const { result } = renderHook(
      () => useFirstPageSeed(paged('LoadingFirstPage'), null),
      { wrapper },
    )
    expect(result.current.results).toEqual([])
  })
})
