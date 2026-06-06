import { describe, expect, it } from 'vitest'

import { shouldEnableViewerSummaryQuery } from '../auth'

describe('shouldEnableViewerSummaryQuery', () => {
  it('waits until Convex auth is authenticated', () => {
    expect(shouldEnableViewerSummaryQuery({ isAuthenticated: false })).toBe(
      false,
    )
    expect(shouldEnableViewerSummaryQuery({ isAuthenticated: true })).toBe(true)
  })
})
