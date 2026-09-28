// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { ConvexError } from 'convex/values'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  campaigns: [
    {
      id: 'campaign_1',
      kind: 'digest',
      title: 'September digest',
      periodStart: 1,
      periodEnd: 2,
      revision: 2,
      state: 'review_ready',
      updatedAt: 2,
    },
    {
      id: 'campaign_2',
      kind: 'announcement',
      title: 'Product launch',
      periodStart: null,
      periodEnd: null,
      revision: 1,
      state: 'draft',
      updatedAt: 1,
    },
  ],
  detail: {} as Record<string, unknown>,
  projects: [] as unknown[],
  create: vi.fn(),
  save: vi.fn(),
  review: vi.fn(),
  sendTest: vi.fn(),
  send: vi.fn(),
  recover: vi.fn(),
  cancel: vi.fn(),
  retryFailedContacts: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useSuspenseQuery: () => ({ data: mocks.campaigns }),
  useQuery: ({ queryKey }: { queryKey: [string, string] }) => {
    const functionName = queryKey[1]
    return functionName === 'emailCampaigns:get'
      ? { data: mocks.detail, isLoading: false }
      : { data: mocks.projects, isLoading: false }
  },
}))

vi.mock('@/features/settings/use-unsaved-changes-guard', () => ({
  useUnsavedChangesGuard: vi.fn(),
}))

vi.mock('../mutations', () => ({
  useCreateEmailCampaign: () => mocks.create,
  useSaveEmailCampaign: () => mocks.save,
  usePrepareEmailCampaignReview: () => mocks.review,
  useSendEmailCampaignTest: () => mocks.sendTest,
  useRequestEmailCampaignSend: () => mocks.send,
  useRecoverEmailCampaignDelivery: () => mocks.recover,
  useCancelEmailCampaignDelivery: () => mocks.cancel,
  useRetryFailedEmailContacts: () => mocks.retryFailedContacts,
}))

import { CampaignWorkspace } from '../components/campaign-workspace'

function campaignDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'campaign_1',
    kind: 'digest',
    title: 'September digest',
    periodStart: 1,
    periodEnd: 2,
    revision: 2,
    templateVersion: 1,
    state: 'review_ready',
    preparationDiagnostics: [],
    sender: 'Locatic <news@locatic.dev>',
    replyTo: 'hello@locatic.dev',
    updatedAt: 2,
    content: {
      subject: 'What builders shipped',
      preheader: 'A fortnight on Locatic',
      introduction: 'A concise community update.',
      projects: [
        {
          projectId: 'project_1',
          name: 'mapkit',
          fullName: 'ada/mapkit',
          description: 'Maps for builders',
          url: 'https://locatic.dev/project/ada/mapkit',
          activityAt: 1,
          activityLabel: 'Latest known public activity on 1 Sep 2026',
        },
        {
          projectId: 'project_2',
          name: 'compiler',
          fullName: 'grace/compiler',
          description: null,
          url: 'https://locatic.dev/project/grace/compiler',
          activityAt: 1,
          activityLabel: 'Latest known public activity on 2 Sep 2026',
        },
      ],
      discussions: [],
      shippingUpdate: '',
    },
    latestRun: {
      id: 'run_1',
      revision: 2,
      stage: 'ready',
      audienceSummary: {
        eligible: 12,
        excludedDisabled: 3,
        excludedInactive: 1,
        excludedUnverified: 2,
        excludedSuppressed: 1,
        excludedDuplicate: 0,
        pendingSync: 0,
      },
      html: '<p>reviewed artifact</p>',
      text: 'reviewed artifact',
      providerBroadcastId: null,
      canCancel: true,
      lastError: null,
      updatedAt: 2,
    },
    ...overrides,
  }
}

describe('CampaignWorkspace', () => {
  beforeEach(() => {
    mocks.detail = campaignDetail()
    mocks.projects = []
    mocks.create.mockReset().mockResolvedValue('campaign_new')
    mocks.save.mockReset().mockResolvedValue(3)
    mocks.review.mockReset().mockResolvedValue('run_1')
    mocks.sendTest.mockReset().mockResolvedValue('email_1')
    mocks.send.mockReset().mockResolvedValue('run_1')
    mocks.recover.mockReset().mockResolvedValue('scheduled')
    mocks.cancel.mockReset().mockResolvedValue('cancelled')
    mocks.retryFailedContacts.mockReset().mockResolvedValue({ retried: 2 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the reviewed artifact and audience separately from editable fields', async () => {
    render(<CampaignWorkspace />)

    expect(
      await screen.findByDisplayValue('What builders shipped'),
    ).toBeTruthy()
    expect(
      screen.getByTitle('reviewed campaign preview').getAttribute('sandbox'),
    ).toBe('')
    expect(screen.getByText('12')).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'send to 12 subscribers',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('saves controlled edits against the loaded revision and disables stale review actions while dirty', async () => {
    const user = userEvent.setup()
    render(<CampaignWorkspace />)
    const subject = await screen.findByLabelText('subject')

    await user.clear(subject)
    await user.type(subject, 'A revised subject')
    expect(
      (
        screen.getByRole('button', {
          name: 'send to 12 subscribers',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'save draft' }))

    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'campaign_1',
        expectedRevision: 2,
        content: expect.objectContaining({ subject: 'A revised subject' }),
      }),
    )
  })

  it('reorders and removes selected projects with labeled keyboard controls', async () => {
    const user = userEvent.setup()
    render(<CampaignWorkspace />)
    await screen.findByText('ada/mapkit')

    const projectSection = screen
      .getByRole('heading', { name: 'selected projects' })
      .closest('section')!
    const rows = within(projectSection).getAllByRole('listitem')
    await user.click(
      within(rows[1]!).getByRole('button', { name: 'move project up' }),
    )
    expect(
      within(projectSection).getAllByRole('listitem')[0]?.textContent,
    ).toContain('grace/compiler')
    await user.click(
      within(within(projectSection).getAllByRole('listitem')[0]!).getByRole(
        'button',
        {
          name: 'remove project',
        },
      ),
    )
    expect(screen.queryByText('grace/compiler')).toBeNull()
  })

  it('surfaces save conflicts inline and keeps the local edit', async () => {
    const user = userEvent.setup()
    mocks.save.mockRejectedValue(
      new ConvexError('Campaign changed. Reload before saving again.'),
    )
    render(<CampaignWorkspace />)
    const title = await screen.findByLabelText('internal title')
    await user.clear(title)
    await user.type(title, 'Local operator edit')
    await user.click(screen.getByRole('button', { name: 'save draft' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'campaign changed',
    )
    expect(screen.getByDisplayValue('Local operator edit')).toBeTruthy()
  })

  it('blocks sending when contact synchronization is pending', async () => {
    mocks.detail = campaignDetail({
      latestRun: {
        ...(campaignDetail().latestRun as Record<string, unknown>),
        audienceSummary: {
          eligible: 12,
          excludedDisabled: 3,
          excludedInactive: 1,
          excludedUnverified: 2,
          excludedSuppressed: 1,
          excludedDuplicate: 0,
          pendingSync: 2,
        },
      },
    })
    render(<CampaignWorkspace />)

    expect(
      (
        await screen.findByRole('button', {
          name: 'send to 12 subscribers',
        })
      ).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('lets an operator retry failed contact synchronization without sending', async () => {
    const user = userEvent.setup()
    mocks.detail = campaignDetail({
      latestRun: {
        ...(campaignDetail().latestRun as Record<string, unknown>),
        audienceSummary: {
          eligible: 12,
          excludedDisabled: 3,
          excludedInactive: 1,
          excludedUnverified: 2,
          excludedSuppressed: 1,
          excludedDuplicate: 0,
          pendingSync: 2,
        },
      },
    })
    render(<CampaignWorkspace />)

    await user.click(
      await screen.findByRole('button', { name: 'retry failed contacts' }),
    )

    expect(mocks.retryFailedContacts).toHaveBeenCalledWith({ limit: 25 })
    expect((await screen.findByRole('status')).textContent).toContain(
      'Requeued 2 failed contacts.',
    )
  })

  it('cancels an undispatched reviewed request without implying recall', async () => {
    const user = userEvent.setup()
    render(<CampaignWorkspace />)

    await user.click(
      await screen.findByRole('button', { name: 'cancel delivery request' }),
    )

    expect(mocks.cancel).toHaveBeenCalledWith({ runId: 'run_1' })
    expect((await screen.findByRole('status')).textContent).toContain(
      'Undispatched delivery request cancelled.',
    )
  })

  it('hides cancellation once provider handoff may have started', async () => {
    mocks.detail = campaignDetail({
      latestRun: {
        ...(campaignDetail().latestRun as Record<string, unknown>),
        stage: 'needs_attention',
        canCancel: false,
        lastError: 'Broadcast creation outcome is unknown',
      },
    })

    render(<CampaignWorkspace />)

    expect(
      screen.queryByRole('button', { name: 'cancel delivery request' }),
    ).toBeNull()
    expect(screen.getByText(/never presented as recall/i)).toBeTruthy()
  })

  it('asks before switching campaigns with unsaved changes', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CampaignWorkspace />)
    const subject = await screen.findByLabelText('subject')
    await user.type(subject, ' changed')
    await user.click(screen.getByRole('button', { name: /Product launch/ }))

    expect(confirm).toHaveBeenCalled()
    expect(
      screen.getByDisplayValue('What builders shipped changed'),
    ).toBeTruthy()
  })

  it('asks before creating a campaign with unsaved changes', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CampaignWorkspace />)
    await user.type(await screen.findByLabelText('subject'), ' changed')
    await user.click(screen.getByRole('button', { name: 'new announcement' }))

    expect(confirm).toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('preserves edits entered while a save request is in flight', async () => {
    let finish!: (revision: number) => void
    mocks.save.mockReset().mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve
        }),
    )
    const user = userEvent.setup()
    render(<CampaignWorkspace />)
    const subject = await screen.findByLabelText('subject')

    await user.type(subject, ' A')
    await user.click(screen.getByRole('button', { name: 'save draft' }))
    await user.type(subject, ' B')
    await act(async () => finish(3))

    expect((subject as HTMLInputElement).value).toBe(
      'What builders shipped A B',
    )
    expect(
      (screen.getByRole('button', { name: 'save draft' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })
})
