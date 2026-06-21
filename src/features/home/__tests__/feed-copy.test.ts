import { describe, expect, it, vi } from 'vitest'

import { getHomeFeedSummary, getHomeFeedTimeCopy } from '../feed-copy'

const actorSnapshot = {
  avatarUrl: '',
  cityId: null,
  cityName: null,
  displayName: 'Avi',
}

describe('home feed grouped copy', () => {
  it('summarizes grouped project likes with soft day copy', () => {
    const now = new Date('2026-06-21T10:00:00.000Z').getTime()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const item = {
      actorSnapshot,
      createdAt: now,
      eventCount: 3,
      eventType: 'project_liked',
      firstEventAt: now - 1000 * 60 * 30,
      groupKind: 'project_liked',
      latestEventAt: now,
    } as any

    expect(getHomeFeedSummary(item)).toBe('Avi liked 3 projects')
    expect(getHomeFeedTimeCopy(item)).toBe('3 likes today')

    vi.useRealTimers()
  })

  it('uses duration copy for grouped comments', () => {
    const latestEventAt = new Date('2026-06-21T10:00:00.000Z').getTime()
    const item = {
      actorSnapshot,
      createdAt: latestEventAt,
      eventCount: 2,
      eventType: 'project_commented',
      firstEventAt: latestEventAt - 1000 * 60 * 60 * 3,
      groupKind: 'project_commented',
      latestEventAt,
    } as any

    expect(getHomeFeedSummary(item)).toBe('Avi left 2 comments')
    expect(getHomeFeedTimeCopy(item)).toBe('2 comments in 3h')
  })
})
