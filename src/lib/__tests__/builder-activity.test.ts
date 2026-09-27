import { describe, expect, it } from 'vitest'

import { NEW_BUILDER_WINDOW_MS, isNewBuilder } from '../builder-activity'

const NOW = Date.UTC(2026, 8, 27, 12)
const DAY_MS = 24 * 60 * 60 * 1000

describe('isNewBuilder', () => {
  it('labels accounts younger than 30 days', () => {
    expect(isNewBuilder(NOW, NOW)).toBe(true)
    expect(isNewBuilder(NOW - 29 * DAY_MS, NOW)).toBe(true)
  })

  it('stops at exactly 30 days', () => {
    expect(isNewBuilder(NOW - NEW_BUILDER_WINDOW_MS + 1, NOW)).toBe(true)
    expect(isNewBuilder(NOW - NEW_BUILDER_WINDOW_MS, NOW)).toBe(false)
    expect(isNewBuilder(NOW - 120 * DAY_MS, NOW)).toBe(false)
  })

  it('still labels an account created ahead of a skewed client clock', () => {
    expect(isNewBuilder(NOW + DAY_MS, NOW)).toBe(true)
  })
})
