// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailRecipient } from '../contracts'
import { makeDetail } from './fixtures'

const mocks = vi.hoisted(() => ({
  recipients: [] as EmailRecipient[],
  loadMore: vi.fn(),
  status: 'Exhausted' as string,
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    results: mocks.recipients,
    status: mocks.status,
    loadMore: mocks.loadMore,
  }),
}))

import { CampaignResults } from '../components/campaign-results'

const NOW = Date.UTC(2026, 9, 1, 12)

const exact = (count: number) => ({ count, capped: false })
const counts = {
  queued: exact(1),
  sent: exact(0),
  delivered: exact(2),
  bounced: exact(1),
  complained: exact(0),
  failed: exact(0),
  cancelled: exact(0),
}

describe('CampaignResults', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    mocks.status = 'Exhausted'
    mocks.recipients = [
      {
        id: 'send_1' as EmailRecipient['id'],
        displayName: 'Ada L',
        githubUsername: 'ada',
        status: 'delivered',
        updatedAt: NOW,
      },
    ]
  })
  afterEach(() => vi.useRealTimers())

  function renderResults(overrides: Parameters<typeof makeDetail>[0] = {}) {
    const onCancel = vi.fn(async () => {})
    const onResume = vi.fn(async () => {})
    render(
      <CampaignResults
        detail={makeDetail({
          state: 'sent',
          sending: { startedAt: NOW, lastBatchAt: NOW, enqueuedAt: NOW },
          results: { counts, total: exact(4) },
          ...overrides,
        })}
        onCancel={onCancel}
        onResume={onResume}
      />,
    )
    return { onCancel, onResume }
  }

  it('shows counts by status and the recipients', () => {
    renderResults()

    const counts = screen.getByRole('list', { name: 'Results by status' })
    expect(within(counts).getByText('delivered').nextSibling?.textContent).toBe(
      '2',
    )
    expect(within(counts).getByText('bounced')).toBeTruthy()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Ada L')).toBeTruthy()
    expect(within(table).getByText('@ada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume sending' })).toBeNull()
  })

  it('explains each status and marks capped counts', () => {
    renderResults({
      results: {
        counts: { ...counts, delivered: { count: 1000, capped: true } },
        total: { count: 1004, capped: true },
      },
    })

    const list = screen.getByRole('list', { name: 'Results by status' })
    expect(within(list).getByText('delivered').nextSibling?.textContent).toBe(
      '1,000+',
    )
    expect(
      within(list).getByText('handed to Resend; delivery not confirmed'),
    ).toBeTruthy()
    expect(within(list).getByText('not handed to Resend yet')).toBeTruthy()
    expect(screen.getByText(/1,004\+ recipients/)).toBeTruthy()
  })

  it('cancels emails still waiting after a confirmation', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onCancel } = renderResults()

    await user.click(
      screen.getByRole('button', { name: 'Cancel emails not sent yet' }),
    )
    expect(confirm.mock.calls[0]?.[0]).toContain("can't be recalled")
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('hides Cancel when nothing is waiting', () => {
    renderResults({
      results: { counts: { ...counts, queued: exact(0) }, total: exact(3) },
    })
    expect(
      screen.queryByRole('button', { name: 'Cancel emails not sent yet' }),
    ).toBeNull()
  })

  it('offers Resume when sending has stalled for five minutes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onResume } = renderResults({
      state: 'sending',
      sending: {
        startedAt: NOW - 10 * 60_000,
        lastBatchAt: NOW - 6 * 60_000,
        enqueuedAt: null,
      },
    })

    await user.click(screen.getByRole('button', { name: 'Resume sending' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('offers to stop a campaign that is still sending, even with nothing waiting', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onCancel } = renderResults({
      state: 'sending',
      sending: { startedAt: NOW, lastBatchAt: NOW, enqueuedAt: null },
      results: { counts: { ...counts, queued: exact(0) }, total: exact(3) },
    })

    expect(
      screen.queryByRole('button', { name: 'Cancel emails not sent yet' }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Stop sending' }))
    expect(confirm.mock.calls[0]?.[0]).toContain('Stop sending to anyone else?')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows Resume and Stop sending together when a send has stalled', () => {
    renderResults({
      state: 'sending',
      sending: {
        startedAt: NOW - 10 * 60_000,
        lastBatchAt: NOW - 6 * 60_000,
        enqueuedAt: null,
      },
    })
    expect(screen.getByRole('button', { name: 'Resume sending' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop sending' })).toBeTruthy()
  })

  it('loads more recipients on request', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocks.status = 'CanLoadMore'
    renderResults()

    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(mocks.loadMore).toHaveBeenCalled()
  })
})
