import { describe, expect, it } from 'vitest'
import { getHomeFeedRenderState } from '../render-state'

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
