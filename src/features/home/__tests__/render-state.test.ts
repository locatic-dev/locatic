import { describe, expect, it } from 'vitest'
import {
  getHomeFeedHandoffState,
  getHomeFeedRenderState,
} from '../render-state'

describe('getHomeFeedRenderState', () => {
  it('keeps the empty state hidden while the first page is loading', () => {
    expect(
      getHomeFeedRenderState({
        itemCount: 0,
        status: 'LoadingFirstPage',
      }),
    ).toBe('loading')
  })

  it('shows the empty state only after an exhausted empty result', () => {
    expect(
      getHomeFeedRenderState({
        itemCount: 0,
        status: 'Exhausted',
      }),
    ).toBe('empty')
  })

  it('renders feed content when results are present', () => {
    expect(
      getHomeFeedRenderState({
        itemCount: 1,
        status: 'LoadingFirstPage',
      }),
    ).toBe('items')
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
