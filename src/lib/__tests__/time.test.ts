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

  it('returns days ago', () => {
    expect(relativeTime(Date.now() - 2 * 86400_000)).toBe('2d ago')
  })

  it('returns weeks ago', () => {
    expect(relativeTime(Date.now() - 10 * 86400_000)).toBe('1w ago')
  })

  it('returns months ago', () => {
    expect(relativeTime(Date.now() - 45 * 86400_000)).toBe('1mo ago')
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
