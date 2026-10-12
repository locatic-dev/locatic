import { describe, expect, it } from 'vitest'

import { LIMITS } from '../../../../convex/lib/email_campaigns'
import {
  audienceLabel,
  EMAIL_LIMITS,
  isStalled,
  resultsSummary,
  skippedSummary,
  STALLED_AFTER_MS,
} from '../contracts'

describe('email campaign contracts', () => {
  it('mirrors the server content limits', () => {
    for (const key of [
      'subject',
      'preheader',
      'body',
      'ctaLabel',
      'url',
      'projects',
      'discussions',
      'sendPreviewMembers',
    ] as const) {
      expect(EMAIL_LIMITS[key], key).toBe(LIMITS[key])
    }
  })

  it('describes skipped members in words', () => {
    expect(
      skippedSummary(
        { unsubscribed: 2, unverified: 1, inactive: 0 },
        'announcement',
      ),
    ).toBe('2 turned updates off · 1 unverified email')
    expect(
      skippedSummary({ unsubscribed: 1, unverified: 0, inactive: 3 }, 'digest'),
    ).toBe('1 not signed up for the digest · 3 inactive accounts')
    expect(
      skippedSummary({ unsubscribed: 0, unverified: 0, inactive: 0 }, 'digest'),
    ).toBe('')
  })

  it('labels capped estimates and results', () => {
    const preview = {
      estimatedCount: 1000,
      capped: true,
      sample: [],
      skipped: { unsubscribed: 0, unverified: 0, inactive: 0 },
    }
    expect(audienceLabel(preview)).toBe('1,000+')
    expect(audienceLabel({ ...preview, estimatedCount: 0 })).toBe('0+')
    expect(
      audienceLabel({ ...preview, estimatedCount: 12, capped: false }),
    ).toBe('12')
    expect(resultsSummary({ total: 4, delivered: 2, capped: false })).toBe(
      'sent to 4 · 2 delivered',
    )
    expect(resultsSummary({ total: 100, delivered: 100, capped: true })).toBe(
      'sent to 100+ · 100 delivered',
    )
  })

  it('treats a sending campaign without a batch for five minutes as stalled', () => {
    const now = 10 * STALLED_AFTER_MS
    const sending = {
      startedAt: 0,
      lastBatchAt: now - STALLED_AFTER_MS - 1,
      enqueuedAt: null,
    }
    expect(isStalled({ state: 'sending', sending }, now)).toBe(true)
    expect(
      isStalled(
        { state: 'sending', sending: { ...sending, lastBatchAt: now - 1000 } },
        now,
      ),
    ).toBe(false)
    expect(isStalled({ state: 'sent', sending }, now)).toBe(false)
  })
})
