// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailSendPreview } from '../contracts'
import { CAMPAIGN_ID } from './fixtures'

const mocks = vi.hoisted(() => ({
  preview: undefined as EmailSendPreview | undefined,
  queried: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: (options: { queryKey: unknown[] }) => {
    mocks.queried(options.queryKey)
    return { data: mocks.preview, isLoading: mocks.preview === undefined }
  },
}))

import { SendDialog } from '../components/send-dialog'

const preview: EmailSendPreview = {
  estimatedCount: 2,
  capped: false,
  sample: [
    { displayName: 'Ada L', githubUsername: 'ada' },
    { displayName: 'Bob', githubUsername: 'bob' },
  ],
  skipped: { unsubscribed: 2, unverified: 1, inactive: 0 },
}

function renderDialog(props: Partial<Parameters<typeof SendDialog>[0]> = {}) {
  const onSend = vi.fn(async () => {})
  render(
    <SendDialog
      campaignId={CAMPAIGN_ID}
      subject="Maps"
      kind="announcement"
      blockedReason={null}
      onSend={onSend}
      {...props}
    />,
  )
  return { onSend }
}

describe('SendDialog', () => {
  beforeEach(() => {
    mocks.preview = preview
  })

  it('shows the estimate, a sample and who is skipped', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Send “Maps” to about 2 people?')
    expect(screen.getByText('Ada L')).toBeTruthy()
    expect(screen.getByText('@bob')).toBeTruthy()
    expect(dialog.textContent).toContain(
      'Not sending to 2 turned updates off · 1 unverified email',
    )
    expect(dialog.textContent).toContain('This number is an estimate')
  })

  it('sends on confirmation and closes', async () => {
    const user = userEvent.setup()
    const { onSend } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    await user.click(screen.getByRole('button', { name: 'Send to 2 people' }))

    expect(onSend).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('says N+ and explains a capped estimate', async () => {
    const user = userEvent.setup()
    mocks.preview = { ...preview, estimatedCount: 97, capped: true }
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Send “Maps” to about 97+ people?')
    expect(dialog.textContent).toContain(
      'Counted from the first 100 members only',
    )
    expect(
      screen.getByRole('button', { name: 'Send to 97+ people' }),
    ).toBeTruthy()
  })

  it('still allows sending when none of the first 100 members would get it', async () => {
    const user = userEvent.setup()
    mocks.preview = {
      estimatedCount: 0,
      capped: true,
      sample: [],
      skipped: { unsubscribed: 100, unverified: 0, inactive: 0 },
    }
    const { onSend } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    expect(screen.getByRole('dialog').textContent).toContain(
      'None of the first 100 members would receive it',
    )
    await user.click(
      screen.getByRole('button', { name: 'Send to everyone eligible' }),
    )
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('blocks sending when no member at all would receive it', async () => {
    const user = userEvent.setup()
    mocks.preview = {
      estimatedCount: 0,
      capped: false,
      sample: [],
      skipped: { unsubscribed: 3, unverified: 0, inactive: 0 },
    }
    const { onSend } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    expect(screen.getByRole('dialog').textContent).toContain(
      'No one would receive this email right now.',
    )
    const confirm = screen.getByRole('button', { name: /^Send to/ })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    await user.click(confirm)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('keeps the send button off while loading or while the draft has unsaved changes', async () => {
    const user = userEvent.setup()
    mocks.preview = undefined
    const { onSend } = renderDialog({
      blockedReason: 'Save your changes before sending.',
    })

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    expect(screen.getByText('Save your changes before sending.')).toBeTruthy()
    const confirm = screen.getByRole('button', { name: /^Send to/ })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    await user.click(confirm)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderDialog()
    const trigger = screen.getByRole('button', { name: 'Review and send' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('shows a failed send inside the dialog and stays open', async () => {
    const user = userEvent.setup()
    const { ConvexError } = await import('convex/values')
    const onSend = vi.fn(async () => {
      throw new ConvexError(
        'Campaign changed. Preview the latest version and send again.',
      )
    })
    renderDialog({ onSend })

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    await user.click(screen.getByRole('button', { name: 'Send to 2 people' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'campaign changed',
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
