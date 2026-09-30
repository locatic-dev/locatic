import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { relativeTime, formatDate } from '../time'

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for recent timestamps', () => {
    expect(relativeTime(Date.now() - 30_000)).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(relativeTime(Date.now() - 3 * 3600_000)).toBe('3h ago')
  })

  it.each([
    [60 * 60_000, '1h ago'],
    [24 * 60 * 60_000, '1d ago'],
    [7 * 24 * 60 * 60_000, '1w ago'],
  ])('never returns zero when crossing a unit boundary', (elapsed, label) => {
    expect(relativeTime(Date.now() - elapsed)).toBe(label)
  })

  it('returns days ago', () => {
    expect(relativeTime(Date.now() - 2 * 86400_000)).toBe('2d ago')
  })

  it('returns weeks ago', () => {
    expect(relativeTime(Date.now() - 10 * 86400_000)).toBe('1w ago')
  })

  it('keeps four-week-old timestamps in weeks until one month', () => {
    expect(relativeTime(Date.now() - 28 * 86400_000)).toBe('4w ago')
    expect(relativeTime(Date.now() - 29 * 86400_000)).toBe('4w ago')
    expect(relativeTime(Date.now() - 30 * 86400_000)).toBe('1mo ago')
  })

  it('returns months ago', () => {
    expect(relativeTime(Date.now() - 45 * 86400_000)).toBe('1mo ago')
    expect(relativeTime(Date.now() - 364 * 86400_000)).toBe('12mo ago')
  })

  it('returns years ago for year-old timestamps', () => {
    expect(relativeTime(Date.now() - 365 * 86400_000)).toBe('1y ago')
    expect(relativeTime(Date.now() - 730 * 86400_000)).toBe('2y ago')
    expect(relativeTime(Date.now() - 1230 * 86400_000)).toBe('3y ago')
  })

  it('treats future timestamps as just now', () => {
    expect(relativeTime(Date.now() + 5 * 60_000)).toBe('just now')
  })

  it('returns a safe fallback for invalid timestamps', () => {
    expect(relativeTime(Number.NaN)).toBe('unknown')
    expect(relativeTime(Number.POSITIVE_INFINITY)).toBe('unknown')
  })
})

describe('formatDate', () => {
  it('formats timestamp to readable date', () => {
    const ts = new Date('2026-03-15').getTime()
    const result = formatDate(ts)
    expect(result).toContain('2026')
    expect(result).toContain('Mar')
  })
})
