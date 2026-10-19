// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailSendLogEntry } from '../contracts'
import { CAMPAIGN_ID } from './fixtures'

const mocks = vi.hoisted(() => ({
  args: undefined as unknown,
  results: [] as EmailSendLogEntry[],
  status: 'Exhausted' as string,
  loadMore: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: (_query: unknown, args: unknown) => {
    mocks.args = args
    return {
      results: mocks.results,
      status: mocks.status,
      loadMore: mocks.loadMore,
    }
  },
}))

import { SendLog } from '../components/send-log'

const entry: EmailSendLogEntry = {
  id: 'send_1' as EmailSendLogEntry['id'],
  campaignId: CAMPAIGN_ID,
  campaignTitle: 'Maps launch',
  displayName: 'Ada L',
  githubUsername: 'ada',
  to: 'ada@example.test',
  status: 'delivered',
  errorMessage: null,
  createdAt: 0,
  updatedAt: 60_000,
}

describe('SendLog', () => {
  beforeEach(() => {
    mocks.results = [
      entry,
      {
        ...entry,
        id: 'send_2' as EmailSendLogEntry['id'],
        displayName: 'Bob',
        githubUsername: 'bob',
        to: null,
        status: 'failed',
        errorMessage: 'Invalid address',
      },
    ]
    mocks.status = 'Exhausted'
    mocks.loadMore.mockReset()
  })

  it('shows who each email went to, from which campaign, and its outcome', () => {
    render(<SendLog status={undefined} onStatusChange={vi.fn()} />)

    expect(mocks.args).toEqual({})
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows[1]!.textContent).toContain('Ada L')
    expect(rows[1]!.textContent).toContain('@ada')
    expect(rows[1]!.textContent).toContain('ada@example.test')
    expect(rows[1]!.textContent).toContain('Maps launch')
    expect(rows[1]!.textContent).toContain('delivered')
    expect(rows[2]!.textContent).toContain('address not recorded')
    expect(rows[2]!.textContent).toContain('Invalid address')
  })

  it('filters by status through the URL', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    const { rerender } = render(
      <SendLog status={undefined} onStatusChange={onStatusChange} />,
    )

    await user.selectOptions(screen.getByLabelText('Status'), 'failed')
    expect(onStatusChange).toHaveBeenLastCalledWith('failed')
    await user.selectOptions(screen.getByLabelText('Status'), '')
    expect(onStatusChange).toHaveBeenLastCalledWith(undefined)

    rerender(<SendLog status="failed" onStatusChange={onStatusChange} />)
    expect(mocks.args).toEqual({ status: 'failed' })
    expect(screen.getByText('could not be sent')).toBeTruthy()
  })

  it('loads more and shows empty states', async () => {
    const user = userEvent.setup()
    mocks.status = 'CanLoadMore'
    const { rerender } = render(
      <SendLog status={undefined} onStatusChange={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(mocks.loadMore).toHaveBeenCalledWith(50)

    mocks.results = []
    mocks.status = 'Exhausted'
    rerender(<SendLog status={undefined} onStatusChange={vi.fn()} />)
    expect(screen.getByText('No emails sent yet.')).toBeTruthy()
    rerender(<SendLog status="bounced" onStatusChange={vi.fn()} />)
    expect(screen.getByText('No emails with this status.')).toBeTruthy()
  })
})
