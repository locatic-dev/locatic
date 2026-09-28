// @vitest-environment jsdom
import { ConvexQueryClient } from '@convex-dev/react-query'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'

import { cityStatsQueryOptions } from '@/features/explore/queries'
import { useExploreSavedProjectIds } from '@/features/explore/use-explore-saves'
import {
  builderSearchQueryOptions,
  citiesByIdsQueryOptions,
  citiesSearchQueryOptions,
  conversationRecipientPreviewQueryOptions,
  notificationsUnreadCountQueryOptions,
  postSearchQueryOptions,
  projectSearchQueryOptions,
} from '../query-options'

/**
 * A QueryClient wired to ConvexQueryClient with a fake Convex client, so the
 * test sees exactly which queries open a live subscription.
 */
function setup() {
  const watchQuery = vi.fn(() => ({
    localQueryResult: () => undefined,
    onUpdate: () => () => {},
  }))
  const convexClient = {
    query: vi.fn(() => new Promise(() => {})),
    watchQuery,
  }
  const convexQueryClient = new ConvexQueryClient(convexClient as never)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: convexQueryClient.queryFn(), retry: false },
    },
  })
  convexQueryClient.connect(queryClient)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const subscribedFunctions = () =>
    watchQuery.mock.calls.map((call) => (call as unknown[])[0])

  return { subscribedFunctions, wrapper }
}

describe('inactive Convex queries hold no subscription', () => {
  it('waits for both a viewer and authenticated Convex before watching unread counts', () => {
    const { subscribedFunctions, wrapper } = setup()
    const { rerender } = renderHook(
      ({ hasViewer, authenticated }) =>
        useQuery(
          notificationsUnreadCountQueryOptions(hasViewer && authenticated),
        ),
      {
        wrapper,
        initialProps: { hasViewer: false, authenticated: false },
      },
    )

    expect(subscribedFunctions()).toEqual([])
    rerender({ hasViewer: true, authenticated: false })
    expect(subscribedFunctions()).toEqual([])
    rerender({ hasViewer: true, authenticated: true })
    expect(subscribedFunctions()).toEqual(['notifications:unreadCount'])
  })

  it('skips empty searches, empty id lists and missing ids', () => {
    const { subscribedFunctions, wrapper } = setup()

    renderHook(
      () => {
        useQuery(cityStatsQueryOptions(null))
        useQuery(citiesSearchQueryOptions('  '))
        useQuery(citiesByIdsQueryOptions([]))
        useQuery(builderSearchQueryOptions({ q: '' }))
        useQuery(projectSearchQueryOptions({ q: '' }))
        useQuery(postSearchQueryOptions({ q: '' }))
        useQuery(conversationRecipientPreviewQueryOptions(null))
      },
      { wrapper },
    )

    expect(subscribedFunctions()).toEqual([])
  })

  it('subscribes once the query has real arguments', () => {
    const { subscribedFunctions, wrapper } = setup()

    renderHook(
      () => {
        useQuery(cityStatsQueryOptions('city_1' as Id<'cities'>))
        useQuery(citiesSearchQueryOptions('berl'))
      },
      { wrapper },
    )

    expect(subscribedFunctions()).toEqual(['cities:getStats', 'cities:search'])
  })

  it('reads no saved state for visitors', () => {
    const { subscribedFunctions, wrapper } = setup()
    const ids = ['p1', 'p2'] as Array<Id<'projects'>>

    const visitor = renderHook(() => useExploreSavedProjectIds(ids, false), {
      wrapper,
    })
    expect(subscribedFunctions()).toEqual([])
    expect(visitor.result.current.size).toBe(0)

    renderHook(() => useExploreSavedProjectIds(ids, true), { wrapper })
    expect(subscribedFunctions()).toEqual(['projects:getSavedState'])
  })
})
