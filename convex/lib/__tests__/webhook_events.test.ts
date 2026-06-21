import { describe, expect, it } from 'vitest'

import {
  compactWebhookError,
  getWebhookProcessingDecision,
} from '../webhook_events'

describe('getWebhookProcessingDecision', () => {
  it('processes first delivery with no existing event records', () => {
    expect(getWebhookProcessingDecision([], 1_000)).toEqual({
      shouldProcess: true,
      status: 'processing',
    })
  })

  it('skips duplicate processed or ignored event records', () => {
    expect(
      getWebhookProcessingDecision(
        [{ status: 'processed', receivedAt: 1_000 }],
        2_000,
      ),
    ).toEqual({
      shouldProcess: false,
      status: 'processed',
    })

    expect(
      getWebhookProcessingDecision(
        [{ status: 'ignored', receivedAt: 1_000 }],
        2_000,
      ),
    ).toEqual({
      shouldProcess: false,
      status: 'ignored',
    })
  })

  it('retries failed and stale processing records', () => {
    expect(
      getWebhookProcessingDecision(
        [{ status: 'failed', receivedAt: 1_000 }],
        2_000,
      ),
    ).toEqual({
      shouldProcess: true,
      status: 'processing',
    })

    expect(
      getWebhookProcessingDecision(
        [{ status: 'processing', receivedAt: 1_000 }],
        1_000 + 10 * 60 * 1000,
      ),
    ).toEqual({
      shouldProcess: true,
      status: 'processing',
    })
  })

  it('does not process fresh in-flight records', () => {
    expect(
      getWebhookProcessingDecision(
        [{ status: 'processing', receivedAt: 1_000 }],
        2_000,
      ),
    ).toEqual({
      shouldProcess: false,
      status: 'processing',
    })
  })

  it('prefers already handled records when duplicate rows disagree', () => {
    expect(
      getWebhookProcessingDecision(
        [
          { status: 'failed', receivedAt: 1_000 },
          { status: 'processed', receivedAt: 1_100 },
        ],
        2_000,
      ),
    ).toEqual({
      shouldProcess: false,
      status: 'processed',
    })
  })
})

describe('compactWebhookError', () => {
  it('keeps stored webhook errors compact', () => {
    expect(compactWebhookError(new Error('x'.repeat(600)))).toHaveLength(500)
  })
})
