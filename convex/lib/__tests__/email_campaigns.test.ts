import { describe, expect, it } from 'vitest'

import {
  assertCampaignDraft,
  assertEmailSize,
  assertRenderedSize,
  assertSendableCampaign,
  emailBytes,
  ENQUEUE_BATCH_BYTES,
  enqueuePageSize,
  LIMITS,
} from '../email_campaigns'
import { UNSUBSCRIBE_URL_PLACEHOLDER } from '../emails/placeholders'

describe('campaign content limits', () => {
  const base = { kind: 'announcement' as const, body: 'Hello', cta: null }

  it('accepts a minimal announcement', () => {
    expect(() =>
      assertCampaignDraft({ subject: 'News', preheader: '', content: base }),
    ).not.toThrow()
  })

  it.each([
    [
      { subject: 'x'.repeat(141), preheader: '', content: base },
      'Subject is too long',
    ],
    [
      { subject: 'News', preheader: 'x'.repeat(201), content: base },
      'Preheader is too long',
    ],
    [
      {
        subject: 'News',
        preheader: '',
        content: { ...base, body: 'x'.repeat(20_001) },
      },
      'Body is too long',
    ],
    [
      {
        subject: 'News',
        preheader: '',
        content: { ...base, cta: { label: 'Go', url: 'http://x.dev' } },
      },
      'Links must use HTTPS',
    ],
    [
      {
        subject: 'News',
        preheader: '',
        content: { ...base, cta: { label: 'Go', url: 'not a url' } },
      },
      'Links must be valid URLs',
    ],
    [
      {
        subject: 'News',
        preheader: '',
        content: {
          ...base,
          cta: { label: 'Go', url: `https://x.dev/${'x'.repeat(2_000)}` },
        },
      },
      'Link is too long',
    ],
    [
      {
        subject: 'News',
        preheader: '',
        content: {
          ...base,
          cta: { label: 'x'.repeat(41), url: 'https://x.dev' },
        },
      },
      'Button label is too long',
    ],
  ])('rejects %#', (draft, message) => {
    expect(() => assertCampaignDraft(draft)).toThrow(message)
  })

  it('limits digest selections and requires HTTPS links on them', () => {
    const digest = {
      kind: 'digest' as const,
      body: 'Hello',
      cta: null,
      periodKey: 'manual:x',
      periodStart: 0,
      periodEnd: 0,
      projects: [],
      discussions: [
        {
          commentId: 'c1' as never,
          title: 'Thread',
          url: 'http://x.dev',
          summary: 'A thread',
        },
      ],
    }
    expect(() =>
      assertCampaignDraft({ subject: 'News', preheader: '', content: digest }),
    ).toThrow('Links must use HTTPS')
  })

  it('requires subject and body before sending', () => {
    expect(() =>
      assertSendableCampaign({ subject: ' ', preheader: '', content: base }),
    ).toThrow('Subject is required')
    expect(() =>
      assertSendableCampaign({
        subject: 'News',
        preheader: '',
        content: { ...base, body: '  ' },
      }),
    ).toThrow('Body is required')
    expect(() =>
      assertSendableCampaign({
        subject: 'News',
        preheader: '',
        content: { ...base, cta: { label: ' ', url: 'https://x.dev' } },
      }),
    ).toThrow('Button label is required')
  })

  it('rejects rendered HTML over the clipping budget', () => {
    expect(() => assertRenderedSize('x'.repeat(100_001))).toThrow(
      'Email is too large',
    )
    expect(() => assertRenderedSize('x'.repeat(100_000))).not.toThrow()
  })
})

describe('per-email size', () => {
  it('counts HTML, text, unsubscribe links and per-recipient records', () => {
    const plain = emailBytes('<p>é</p>', 'é')
    // 'é' is two bytes in UTF-8.
    expect(plain).toBe(9 + 2 + 4_096)
    expect(
      emailBytes(
        `<a href="${UNSUBSCRIBE_URL_PLACEHOLDER}">x</a>`,
        UNSUBSCRIBE_URL_PLACEHOLDER,
      ) - emailBytes(`<a href="">x</a>`, ''),
    ).toBe(2 * (512 + UNSUBSCRIBE_URL_PLACEHOLDER.length))
  })

  it('rejects an email over the per-email budget even when its HTML is under the clipping cap', () => {
    const html = 'x'.repeat(90_000)
    expect(() => assertEmailSize(html, 'y'.repeat(10_000))).not.toThrow()
    expect(() => assertEmailSize(html, 'y'.repeat(40_000))).toThrow(
      'Email is too large to send',
    )
    expect(() => assertEmailSize('x'.repeat(100_001), '')).toThrow(
      'Email is too large; shorten the body',
    )
  })

  it('sizes enqueue pages so one batch stays far under the write limit', () => {
    expect(enqueuePageSize('<p>x</p>', 'x')).toBe(100)
    expect(enqueuePageSize('<p>x</p>', 'x', 7)).toBe(7)
    const largest = 'x'.repeat(LIMITS.emailBytes - 4_096)
    const pageSize = enqueuePageSize(largest, '')
    expect(pageSize).toBeLessThan(100)
    expect(pageSize * LIMITS.emailBytes).toBeLessThanOrEqual(
      ENQUEUE_BATCH_BYTES,
    )
    // The component batches up to 100 emails per read: still under 16 MiB.
    expect(100 * LIMITS.emailBytes).toBeLessThan(16 * 1024 * 1024 * 0.8)
  })
})
