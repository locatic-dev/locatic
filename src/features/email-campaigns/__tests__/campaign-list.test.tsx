// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailCampaignSummary } from '../contracts'
import { CAMPAIGN_ID } from './fixtures'

const mocks = vi.hoisted(() => ({
  campaigns: [] as EmailCampaignSummary[],
  remove: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
  }: {
    children: ReactNode
    params?: { campaignId: string }
  }) => <a href={`/admin/emails/${params?.campaignId ?? ''}`}>{children}</a>,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useSuspenseQuery: () => ({ data: mocks.campaigns }),
}))

vi.mock('../mutations', () => ({
  useDeleteEmailCampaigns: () => mocks.remove,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { CampaignIndex } from '../components/campaign-list'

const draft: EmailCampaignSummary = {
  id: CAMPAIGN_ID,
  kind: 'announcement',
  title: 'Maps launch',
  revision: 2,
  state: 'draft',
  updatedAt: 0,
  sendAt: null,
  results: null,
}
const sent: EmailCampaignSummary = {
  ...draft,
  id: 'campaign_2' as EmailCampaignSummary['id'],
  title: 'September',
  kind: 'digest',
  state: 'sent',
  results: {
    total: { count: 3, capped: false },
    delivered: { count: 1, capped: false },
  },
}

describe('CampaignIndex', () => {
  beforeEach(() => {
    mocks.campaigns = [draft, sent]
    mocks.remove.mockReset()
  })

  it('splits drafts from sent campaigns, each linking to its page', () => {
    render(<CampaignIndex />)

    const drafts = screen.getByRole('region', { name: 'drafts' })
    const sentSection = screen.getByRole('region', { name: 'sent' })
    expect(
      within(drafts)
        .getByRole('link', { name: 'Maps launch' })
        .getAttribute('href'),
    ).toBe(`/admin/emails/${CAMPAIGN_ID}`)
    expect(within(drafts).queryByText('September')).toBeNull()
    const row = within(sentSection)
      .getByRole('link', { name: 'September' })
      .closest('tr')!
    expect(row.textContent).toContain('digest')
    expect(row.textContent).toContain('3 recipients · 1 delivered')
    // Sent campaigns are a record of what went out: no selection.
    expect(within(sentSection).queryByRole('checkbox')).toBeNull()
  })

  it('bulk deletes the selected drafts after confirming', async () => {
    const user = userEvent.setup()
    const second: EmailCampaignSummary = {
      ...draft,
      id: 'campaign_3' as EmailCampaignSummary['id'],
      title: 'Profiles',
    }
    mocks.campaigns = [draft, second, sent]
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    mocks.remove.mockResolvedValue({ deleted: 2 })
    render(<CampaignIndex />)

    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Select Profiles' }))
    expect(screen.getByRole('button', { name: 'Delete 1 draft' })).toBeTruthy()
    await user.click(
      screen.getByRole('checkbox', { name: 'Select all drafts' }),
    )
    const button = screen.getByRole('button', { name: 'Delete 2 drafts' })
    await user.click(button)
    expect(confirm).toHaveBeenLastCalledWith(
      "Delete 2 drafts? This can't be undone.",
    )
    expect(mocks.remove).not.toHaveBeenCalled()
    await user.click(button)
    expect(mocks.remove).toHaveBeenCalledWith({
      campaignIds: [CAMPAIGN_ID, second.id],
    })
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Select all drafts',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false)
    confirm.mockRestore()
  })

  it('shows when a scheduled campaign sends', () => {
    mocks.campaigns = [
      {
        ...sent,
        state: 'scheduled',
        results: null,
        sendAt: Date.UTC(2026, 9, 21, 9),
      },
    ]
    render(<CampaignIndex />)

    const row = screen.getByRole('link', { name: 'September' }).closest('tr')!
    expect(row.textContent).toContain('scheduled')
    expect(row.textContent).toMatch(/sends Oct 21, 2026/)
  })

  it('shows empty states', () => {
    mocks.campaigns = []
    render(<CampaignIndex />)

    expect(
      screen.getByText('No drafts. Start a new update or digest.'),
    ).toBeTruthy()
    expect(screen.getByText('Nothing sent yet.')).toBeTruthy()
  })
})
