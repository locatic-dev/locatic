// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailCampaignDetail } from '../contracts'
import { CAMPAIGN_ID, makeDetail } from './fixtures'

type QueryOptions = { queryKey: [string, string, unknown] }

const mocks = vi.hoisted(() => ({
  detail: undefined as EmailCampaignDetail | null | undefined,
  detailError: null as Error | null,
  refetchDetail: vi.fn(),
  navigate: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  unschedule: vi.fn(),
  sendTest: vi.fn(),
  requestSend: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => undefined,
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey: [, name, args] }: QueryOptions) =>
    name === 'emailCampaigns:get' && args !== 'skip'
      ? {
          data: mocks.detailError ? undefined : mocks.detail,
          error: mocks.detailError,
          refetch: mocks.refetchDetail,
        }
      : name === 'emailCampaigns:getSendPreview' && args !== 'skip'
        ? {
            data: {
              estimatedCount: 2,
              capped: false,
              sample: [],
              skipped: { unsubscribed: 0, unverified: 0, inactive: 0 },
            },
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
  useDeleteEmailCampaign: () => mocks.remove,
  useUnscheduleEmailSend: () => mocks.unschedule,
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

import { CampaignPage } from '../components/campaign-page'
import { AUTOSAVE_DELAY_MS } from '../use-draft-autosave'

const AUTOSAVE_WAIT = { timeout: AUTOSAVE_DELAY_MS + 1_500 }

function resetMocks() {
  mocks.detailError = null
  for (const fn of [
    mocks.refetchDetail,
    mocks.navigate,
    mocks.create,
    mocks.save,
    mocks.remove,
    mocks.unschedule,
    mocks.sendTest,
    mocks.requestSend,
  ]) {
    fn.mockReset()
  }
}

afterEach(() => vi.restoreAllMocks())

describe('a New draft', () => {
  beforeEach(() => {
    resetMocks()
    mocks.detail = undefined
  })

  it('writes nothing until it has content', async () => {
    render(<CampaignPage campaignId="new" kind="update" />)

    expect(screen.getByRole('heading', { name: 'New update' })).toBeTruthy()
    expect(screen.getByText('Saves as you type')).toBeTruthy()
    for (const name of ['Test', 'Send']) {
      expect(
        (screen.getByRole('tab', { name }) as HTMLButtonElement).disabled,
      ).toBe(true)
    }
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 200))
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('creates once on the first pause, keeps the editor when the URL moves, then saves edits', async () => {
    const user = userEvent.setup()
    mocks.create.mockResolvedValue(CAMPAIGN_ID)
    mocks.save.mockResolvedValue(2)
    const { rerender } = render(<CampaignPage campaignId="new" kind="update" />)

    await user.type(screen.getByLabelText('Subject'), 'Maps are live')
    await waitFor(() => expect(mocks.create).toHaveBeenCalled(), AUTOSAVE_WAIT)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledWith({
      title: 'Maps are live',
      subject: 'Maps are live',
      preheader: '',
      content: { kind: 'announcement', body: '', cta: null },
      audience: { kind: 'everyone' },
    })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/admin/emails/$campaignId',
      params: { campaignId: CAMPAIGN_ID },
      replace: true,
    })

    // The router moves to the new id before its campaign has loaded; the
    // editor and what was typed stay.
    rerender(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)
    const subject = screen.getByLabelText('Subject') as HTMLInputElement
    expect(subject.value).toBe('Maps are live')
    await user.type(subject, '!')
    await waitFor(() => expect(mocks.save).toHaveBeenCalled(), AUTOSAVE_WAIT)
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        expectedRevision: 1,
        subject: 'Maps are live!',
      }),
    )
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('discards unsaved writing after confirming, storing nothing', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CampaignPage campaignId="new" kind="digest" />)

    await user.type(screen.getByLabelText('Title'), 'Oct')
    await user.click(screen.getByRole('button', { name: 'Discard draft' }))

    expect(confirm).toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/admin/emails',
      replace: true,
    })
  })
})

describe('New draft sessions (review regressions)', () => {
  beforeEach(() => {
    resetMocks()
    mocks.detail = undefined
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => {
      resolve = done
    })
    return { promise, resolve }
  }

  it('starts a fresh draft on a second New, never editing the first', async () => {
    const user = userEvent.setup()
    mocks.create
      .mockResolvedValueOnce(CAMPAIGN_ID)
      .mockResolvedValueOnce('campaign_2')
    const { rerender } = render(<CampaignPage campaignId="new" kind="update" />)
    await user.type(screen.getByLabelText('Subject'), 'First')
    await waitFor(() => expect(mocks.create).toHaveBeenCalled(), AUTOSAVE_WAIT)
    rerender(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    // New update again: an empty composer with nothing stored.
    rerender(<CampaignPage campaignId="new" kind="update" />)
    const subject = screen.getByLabelText('Subject') as HTMLInputElement
    expect(subject.value).toBe('')
    await user.type(subject, 'Second')
    await waitFor(
      () => expect(mocks.create).toHaveBeenCalledTimes(2),
      AUTOSAVE_WAIT,
    )
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ subject: 'Second' }),
    )
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('deletes a draft whose first create was still pending at Discard', async () => {
    const user = userEvent.setup()
    const create = deferred<string>()
    mocks.create.mockReturnValue(create.promise)
    mocks.remove.mockResolvedValue(null)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CampaignPage campaignId="new" kind="update" />)

    await user.type(screen.getByLabelText('Subject'), 'Oops')
    await waitFor(() => expect(mocks.create).toHaveBeenCalled(), AUTOSAVE_WAIT)
    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
    create.resolve(CAMPAIGN_ID)

    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith({ campaignId: CAMPAIGN_ID }),
    )
    // Discard leaves for the list; the create does not pull the page back.
    expect(mocks.navigate).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/admin/emails',
      replace: true,
    })
  })

  it('does not navigate when a create finishes after the editor was left', async () => {
    const user = userEvent.setup()
    const create = deferred<string>()
    mocks.create.mockReturnValue(create.promise)
    const { unmount } = render(<CampaignPage campaignId="new" kind="update" />)

    await user.type(screen.getByLabelText('Subject'), 'Left')
    await waitFor(() => expect(mocks.create).toHaveBeenCalled(), AUTOSAVE_WAIT)
    unmount()
    create.resolve(CAMPAIGN_ID)
    await create.promise
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('shows not found when the created campaign is deleted elsewhere', async () => {
    const user = userEvent.setup()
    mocks.create.mockResolvedValue(CAMPAIGN_ID)
    const { rerender } = render(<CampaignPage campaignId="new" kind="update" />)
    await user.type(screen.getByLabelText('Subject'), 'Gone')
    await waitFor(() => expect(mocks.create).toHaveBeenCalled(), AUTOSAVE_WAIT)

    mocks.detail = null
    rerender(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)
    expect(
      screen.getByRole('heading', { name: 'Campaign not found' }),
    ).toBeTruthy()
  })
})

describe('a stored campaign', () => {
  beforeEach(() => {
    resetMocks()
    mocks.detail = makeDetail()
  })

  it('opens a draft on Write with a live preview, and moves between tabs', async () => {
    const user = userEvent.setup()
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    expect(screen.getByRole('heading', { name: 'Maps launch' })).toBeTruthy()
    expect(await screen.findByTitle('Email preview')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Test' }))
    expect(
      (screen.getByLabelText('Send a test to') as HTMLInputElement).value,
    ).toBe('admin@example.test')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Review and send' })).toBeTruthy()
  })

  it('autosaves edits with the version it started from', async () => {
    const user = userEvent.setup()
    mocks.save.mockResolvedValue(3)
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    await user.type(screen.getByLabelText('Subject'), '!')
    await waitFor(() => expect(mocks.save).toHaveBeenCalled(), AUTOSAVE_WAIT)
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        expectedRevision: 2,
        subject: 'Maps!',
        audience: { kind: 'everyone' },
      }),
    )
    expect(await screen.findByText(/^Saved \d/)).toBeTruthy()
  })

  it('shows a failed save with Retry', async () => {
    const user = userEvent.setup()
    mocks.save.mockRejectedValueOnce(new Error('network'))
    mocks.save.mockResolvedValue(3)
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    await user.type(screen.getByLabelText('Subject'), '!')
    const status = await screen.findByText("Couldn't save", {}, AUTOSAVE_WAIT)
    await user.click(within(status).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/^Saved \d/)).toBeTruthy()
  })

  it('sends a test of the unsaved draft', async () => {
    const user = userEvent.setup()
    mocks.sendTest.mockResolvedValue(null)
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    await user.type(screen.getByLabelText('Subject'), '!')
    await user.click(screen.getByRole('tab', { name: 'Test' }))
    await user.click(screen.getByRole('button', { name: 'Send test' }))

    expect(mocks.sendTest).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Maps!' }),
    )
  })

  it('discards a stored draft after confirming and returns to the list', async () => {
    const user = userEvent.setup()
    mocks.remove.mockResolvedValue(null)
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(mocks.remove).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(confirm).toHaveBeenLastCalledWith(
      'Discard "Maps launch"? This can\'t be undone.',
    )
    expect(mocks.remove).toHaveBeenCalledWith({ campaignId: CAMPAIGN_ID })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/admin/emails',
      replace: true,
    })
  })

  it('schedules from the send dialog and offers Undo', async () => {
    const user = userEvent.setup()
    mocks.requestSend.mockResolvedValue({ sendAt: Date.now() + 30_000 })
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    await user.click(screen.getByRole('tab', { name: 'Send' }))
    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    await user.click(screen.getByRole('button', { name: 'Send to 2 people' }))

    await waitFor(() =>
      expect(mocks.requestSend).toHaveBeenCalledWith({
        campaignId: CAMPAIGN_ID,
        expectedRevision: 2,
        copy: 'archive',
      }),
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Sending in 30 seconds.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Undo' }),
      }),
    )
  })

  it('shows why a scheduled send did not start', () => {
    mocks.detail = makeDetail({
      preparationDiagnostics: [
        'Not sent: Email sending was turned off before the send time.',
      ],
    })
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    expect(screen.getByRole('alert').textContent).toContain(
      'Email sending was turned off before the send time.',
    )
  })

  it('counts down a scheduled send and undoes it with its revision', async () => {
    const user = userEvent.setup()
    mocks.unschedule.mockResolvedValue(null)
    mocks.detail = makeDetail({
      state: 'scheduled',
      revision: 3,
      scheduled: {
        sendAt: Date.now() + 25_000,
        copyTo: 'contact@locatic.dev',
      },
    })
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    expect(
      screen.getByRole('heading', { name: /^Sending in 0:2\d$/ }),
    ).toBeTruthy()
    expect(screen.getByText('A copy goes to contact@locatic.dev.')).toBeTruthy()
    expect(screen.queryByLabelText('Subject')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(mocks.unschedule).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      expectedRevision: 3,
    })
  })

  it('shows a far-off send time with Cancel', () => {
    mocks.detail = makeDetail({
      state: 'scheduled',
      scheduled: { sendAt: Date.now() + 2 * 86_400_000, copyTo: null },
    })
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    expect(
      screen.getByRole('heading', { name: /^Scheduled for / }),
    ).toBeTruthy()
    expect(screen.getByText('No copy.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel and edit' })).toBeTruthy()
  })

  it('says when a campaign does not exist', () => {
    mocks.detail = null
    render(<CampaignPage campaignId="missing" kind="update" />)

    expect(
      screen.getByRole('heading', { name: 'Campaign not found' }),
    ).toBeTruthy()
  })

  it('shows a failed load with Retry', async () => {
    const user = userEvent.setup()
    mocks.detailError = new Error('network')
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    const alert = screen.getByRole('alert')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(mocks.refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('opens a campaign that has started sending on its results', () => {
    const none = { count: 0, capped: false }
    mocks.detail = makeDetail({
      state: 'sent',
      sending: { startedAt: 0, lastBatchAt: 0, enqueuedAt: 0 },
      results: {
        counts: {
          queued: none,
          sent: { count: 1, capped: false },
          delivered: none,
          bounced: none,
          complained: none,
          failed: none,
          cancelled: none,
        },
        total: { count: 1, capped: false },
      },
    })
    render(<CampaignPage campaignId={CAMPAIGN_ID} kind="update" />)

    expect(screen.queryByRole('tab', { name: 'Write' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Results by status' })).toBeTruthy()
  })
})
