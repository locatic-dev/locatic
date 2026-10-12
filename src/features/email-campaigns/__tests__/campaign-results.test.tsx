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

const counts = {
  queued: 1,
  sent: 0,
  delivered: 2,
  bounced: 1,
  complained: 0,
  failed: 0,
  cancelled: 0,
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
          results: { counts, total: 4, capped: false },
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
      results: { counts: { ...counts, queued: 0 }, total: 3, capped: false },
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
      results: { counts: { ...counts, queued: 0 }, total: 3, capped: false },
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
