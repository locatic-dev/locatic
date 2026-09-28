import { describe, expect, it } from 'vitest'

import { getExploreTextQuery, normalizeExploreSearch } from '../state'

describe('getExploreTextQuery', () => {
  const shared = normalizeExploreSearch({ mode: 'projects', q: 'maps' })

  it('runs the text search for members', () => {
    expect(getExploreTextQuery(shared, false)).toBe('maps')
  })

  it('shows visitors the browse feed for a shared ?q= link, since search needs a viewer', () => {
    expect(getExploreTextQuery(shared, true)).toBe('')
  })
})
