import { describe, expect, it, vi } from 'vitest'

import { formatDate } from '../time'

// 23:30 UTC on 26 Sep is already 27 Sep in Tokyo and still 26 Sep in LA.
const lateUtcEvening = Date.UTC(2026, 8, 26, 23, 30)

/** Formats as a process running in `timeZone` would, unless a zone is pinned. */
function formatDateIn(timeZone: string) {
  const spy = vi
    .spyOn(Date.prototype, 'toLocaleDateString')
    .mockImplementation(function (this: Date, locale, options) {
      return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(
        this,
      )
    })
  try {
    return formatDate(lateUtcEvening)
  } finally {
    spy.mockRestore()
  }
}

describe('formatDate', () => {
  it('renders the UTC calendar date', () => {
    expect(formatDate(lateUtcEvening)).toBe('Sep 26, 2026')
  })

  it('renders the same date whatever the runtime time zone, so SSR and hydration agree', () => {
    expect(formatDateIn('Asia/Tokyo')).toBe('Sep 26, 2026')
    expect(formatDateIn('America/Los_Angeles')).toBe('Sep 26, 2026')
  })
})
