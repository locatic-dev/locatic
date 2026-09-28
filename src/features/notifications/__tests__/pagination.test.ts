import { describe, expect, it } from 'vitest'

import { getNotificationsListState } from '../pagination'

describe('notifications list state', () => {
  it('shows the SSR first page until the live list arrives', () => {
    expect(
      getNotificationsListState({
        liveItems: [],
        ssrItems: ['n1', 'n2'],
        status: 'LoadingFirstPage',
      }),
    ).toEqual({ items: ['n1', 'n2'], canLoadMore: false, loadingMore: false })
  })

  it('offers load more whenever more pages exist, even after an empty page', () => {
    expect(
      getNotificationsListState({
        liveItems: [],
        ssrItems: [],
        status: 'CanLoadMore',
      }).canLoadMore,
    ).toBe(true)
    expect(
      getNotificationsListState({
        liveItems: ['n1'],
        ssrItems: [],
        status: 'LoadingMore',
      }),
    ).toEqual({ items: ['n1'], canLoadMore: false, loadingMore: true })
  })
})
