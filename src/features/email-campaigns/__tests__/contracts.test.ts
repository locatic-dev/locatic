import { describe, expect, it } from 'vitest'

import { LIMITS } from '../../../../convex/lib/email_campaigns'
import {
  audienceLabel,
  emptyDraft,
  formatBoundedCount,
  EMAIL_LIMITS,
  isStalled,
  resultsSummary,
  skippedSummary,
  STALLED_AFTER_MS,
  titleForSave,
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
    const exact = (count: number) => ({ count, capped: false })
    const capped = (count: number) => ({ count, capped: true })
    expect(resultsSummary({ total: exact(4), delivered: exact(2) })).toBe(
      '4 recipients · 2 delivered',
    )
    expect(resultsSummary({ total: exact(1), delivered: exact(0) })).toBe(
      '1 recipient · 0 delivered',
    )
    expect(resultsSummary({ total: capped(100), delivered: capped(100) })).toBe(
      '100+ recipients · 100+ delivered',
    )
    expect(formatBoundedCount(capped(1000))).toBe('1,000+')
    expect(formatBoundedCount(exact(1000))).toBe('1,000')
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

describe('new drafts', () => {
  it('starts empty, with digest period placeholders the server replaces', () => {
    expect(emptyDraft('update').content).toEqual({
      kind: 'announcement',
      body: '',
      cta: null,
    })
    expect(emptyDraft('digest').content).toMatchObject({
      kind: 'digest',
      projects: [],
      discussions: [],
    })
  })

  it('saves a typed title, else the subject, else "Untitled"', () => {
    const draft = emptyDraft('update')
    expect(titleForSave({ ...draft, title: ' Launch ' })).toBe('Launch')
    expect(titleForSave({ ...draft, subject: ' Maps ' })).toBe('Maps')
    // A subject always fits: its limit is below the title's.
    expect(EMAIL_LIMITS.subject).toBeLessThan(EMAIL_LIMITS.title)
    expect(titleForSave(draft)).toBe('Untitled update')
    expect(titleForSave(emptyDraft('digest'))).toBe('Untitled digest')
  })
})
