// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailCampaignDetail, EmailCampaignSummary } from '../contracts'
import { CAMPAIGN_ID, makeDetail } from './fixtures'

type QueryOptions = { queryKey: [string, string, unknown] }

const mocks = vi.hoisted(() => ({
  campaigns: [] as EmailCampaignSummary[],
  detail: null as EmailCampaignDetail | null,
  create: vi.fn(),
  save: vi.fn(),
  sendTest: vi.fn(),
  requestSend: vi.fn(),
  detailError: null as Error | null,
  refetchDetail: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => undefined,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useSuspenseQuery: ({ queryKey: [, name] }: QueryOptions) => {
    if (name === 'emailCampaigns:list') return { data: mocks.campaigns }
    throw new Error(`unexpected suspense query ${name}`)
  },
  useQuery: ({ queryKey: [, name] }: QueryOptions) =>
    name === 'emailCampaigns:get'
      ? {
          data: mocks.detailError ? undefined : mocks.detail,
          error: mocks.detailError,
          isLoading: false,
          refetch: mocks.refetchDetail,
        }
      : { data: undefined, isLoading: false },
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    results: [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
}))

vi.mock('../mutations', () => ({
  useCreateEmailCampaign: () => mocks.create,
  useSaveEmailCampaign: () => mocks.save,
  usePreviewEmailCampaign: () =>
    vi.fn(async ({ requestId }: { requestId: number }) => ({
      requestId,
      html: '<p>preview</p>',
    })),
  useSendEmailTest: () => mocks.sendTest,
  useRequestEmailSend: () => mocks.requestSend,
  useCancelEmailSend: () => vi.fn(),
  useResumeEmailSend: () => vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'

import { CampaignWorkspace } from '../components/campaign-workspace'

const summary: EmailCampaignSummary = {
  id: CAMPAIGN_ID,
  kind: 'announcement',
  title: 'Maps launch',
  revision: 2,
  state: 'draft',
  updatedAt: 0,
  results: null,
}

describe('CampaignWorkspace', () => {
  beforeEach(() => {
    mocks.campaigns = [summary]
    mocks.detail = makeDetail()
    mocks.detailError = null
    mocks.refetchDetail.mockReset()
    for (const fn of [
      mocks.create,
      mocks.save,
      mocks.sendTest,
      mocks.requestSend,
    ]) {
      fn.mockReset()
    }
  })

  it('lists campaigns with their type, state and results', () => {
    mocks.campaigns = [
      summary,
      {
        ...summary,
        id: 'campaign_2' as EmailCampaignSummary['id'],
        title: 'September',
        kind: 'digest',
        state: 'sent',
        results: {
          total: { count: 3, capped: false },
          delivered: { count: 1, capped: false },
        },
      },
    ]
    render(<CampaignWorkspace />)

    const list = screen.getByRole('list', { name: 'Campaigns' })
    const sent = within(list).getByRole('button', { name: /September/ })
    expect(sent.textContent).toContain('digest')
    expect(sent.textContent).toContain('3 recipients · 1 delivered')
    expect(
      within(list)
        .getByRole('button', { name: /Maps launch/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('creates updates and digests', async () => {
    const user = userEvent.setup()
    mocks.create.mockResolvedValue('campaign_3')
    render(<CampaignWorkspace />)

    await user.click(screen.getByRole('button', { name: 'New update' }))
    await user.click(screen.getByRole('button', { name: 'New digest' }))
    expect(mocks.create.mock.calls.map(([args]) => args.kind)).toEqual([
      'announcement',
      'digest',
    ])
  })

  it('opens a draft on Write with a live preview, and moves between tabs', async () => {
    const user = userEvent.setup()
    render(<CampaignWorkspace />)

    expect(
      screen.getByRole('tab', { name: 'Write' }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByLabelText('Subject')).toBeTruthy()
    expect(await screen.findByTitle('Email preview')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Test' }))
    expect(
      (screen.getByLabelText('Send a test to') as HTMLInputElement).value,
    ).toBe('admin@example.test')

    await user.keyboard('{ArrowRight}')
    expect(
      screen.getByRole('tab', { name: 'Send' }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'Review and send' })).toBeTruthy()
  })

  it('saves edits with the version it started from', async () => {
    const user = userEvent.setup()
    mocks.save.mockResolvedValue(3)
    render(<CampaignWorkspace />)

    await user.type(screen.getByLabelText('Subject'), '!')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        expectedRevision: 2,
        subject: 'Maps!',
      }),
    )
  })

  it('sends a test of the unsaved draft', async () => {
    const user = userEvent.setup()
    mocks.sendTest.mockResolvedValue(null)
    render(<CampaignWorkspace />)

    await user.type(screen.getByLabelText('Subject'), '!')
    await user.click(screen.getByRole('tab', { name: 'Test' }))
    await user.click(screen.getByRole('button', { name: 'Send test' }))

    expect(mocks.sendTest).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'admin@example.test',
        subject: 'Maps!',
      }),
    )
    // Queued, not sent: the component delivers it a moment later.
    expect(toast.success).toHaveBeenCalledWith(
      'Test email queued for admin@example.test.',
    )
  })

  it('shows a failed campaign load with Retry instead of the empty state', async () => {
    const user = userEvent.setup()
    mocks.detailError = new Error('network')
    render(<CampaignWorkspace />)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain("Couldn't load this campaign.")
    expect(screen.queryByText('Pick a campaign or start a new one.')).toBeNull()
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(mocks.refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('opens a campaign that has started sending on its results', () => {
    mocks.detail = makeDetail({
      state: 'sent',
      sending: { startedAt: 0, lastBatchAt: 0, enqueuedAt: 0 },
      results: {
        counts: {
          queued: { count: 0, capped: false },
          sent: { count: 1, capped: false },
          delivered: { count: 0, capped: false },
          bounced: { count: 0, capped: false },
          complained: { count: 0, capped: false },
          failed: { count: 0, capped: false },
          cancelled: { count: 0, capped: false },
        },
        total: { count: 1, capped: false },
      },
    })
    render(<CampaignWorkspace />)

    expect(screen.queryByRole('tab', { name: 'Write' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Results by status' })).toBeTruthy()
  })
})
