import { describe, expect, it } from 'vitest'

import {
  LIVE_WINDOW_MS,
  NEW_BUILDER_WINDOW_MS,
  isLive,
  isNewBuilder,
} from '../builder-activity'

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

describe('isLive', () => {
  const HOUR_MS = 60 * 60 * 1000

  it('is live for activity inside the last 24 hours', () => {
    expect(isLive(NOW - 23 * HOUR_MS, NOW)).toBe(true)
    expect(isLive(NOW, NOW)).toBe(true)
  })

  it('stops at 24 hours', () => {
    expect(isLive(NOW - LIVE_WINDOW_MS, NOW)).toBe(false)
    expect(isLive(NOW - 25 * HOUR_MS, NOW)).toBe(false)
  })

  it('is not live without an activity time', () => {
    expect(isLive(null, NOW)).toBe(false)
    expect(isLive(undefined, NOW)).toBe(false)
  })

  it('ignores activity far ahead of the clock', () => {
    expect(isLive(NOW + 30_000, NOW)).toBe(true)
    expect(isLive(NOW + DAY_MS, NOW)).toBe(false)
  })
})
