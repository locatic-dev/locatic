import { describe, expect, it } from 'vitest'
import { HOME_FEED_RETENTION_MS } from '../../../../convex/lib/homeFeed'
import {
  HOME_FEED_WINDOW_DAYS,
  getHomeFeedHandoffState,
  getHomeFeedState,
  getQuietFeedTitle,
} from '../render-state'

describe('getHomeFeedState', () => {
  it('is ready whenever there are rows', () => {
    expect(getHomeFeedState({ followingCount: 0, itemCount: 1 })).toEqual({
      kind: 'ready',
    })
  })

  it('separates following nobody from a quiet window', () => {
    expect(
      getHomeFeedState({
        followingCount: 0,
        itemCount: 0,
      }),
    ).toEqual({ kind: 'noFollows' })
    expect(
      getHomeFeedState({
        followingCount: 1,
        itemCount: 0,
      }),
    ).toEqual({ kind: 'quiet30d', followingCount: 1 })
  })
})

describe('home feed window copy', () => {
  it('names the same interval the backend retains', () => {
    expect(HOME_FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toBe(
      HOME_FEED_RETENTION_MS,
    )
  })

  it('counts the people followed and names the 30-day window', () => {
    expect(getQuietFeedTitle(3)).toBe(
      'nothing from the 3 people you follow in the last 30 days.',
    )
    expect(getQuietFeedTitle(1)).toBe(
      'nothing from the 1 person you follow in the last 30 days.',
    )
  })
})

describe('getHomeFeedHandoffState', () => {
  it('uses SSR items while the live first page is loading', () => {
    expect(
      getHomeFeedHandoffState({
        ssrItems: ['ssr-item'],
        paginatedItems: [],
        status: 'LoadingFirstPage',
      }),
    ).toEqual({
      items: ['ssr-item'],
      status: 'Idle',
    })
  })

  it('uses live items after the paginated feed resolves with content', () => {
    expect(
      getHomeFeedHandoffState({
        ssrItems: ['ssr-item'],
        paginatedItems: ['live-item'],
        status: 'CanLoadMore',
      }),
    ).toEqual({
      items: ['live-item'],
      status: 'CanLoadMore',
    })
  })

  it('uses live empty results after the paginated feed resolves empty', () => {
    expect(
      getHomeFeedHandoffState({
        ssrItems: ['stale-ssr-item'],
        paginatedItems: [],
        status: 'Exhausted',
      }),
    ).toEqual({
      items: [],
      status: 'Exhausted',
    })
  })
})
