// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailSendPreview } from '../contracts'
import { CAMPAIGN_ID } from './fixtures'

const mocks = vi.hoisted(() => ({
  preview: undefined as EmailSendPreview | undefined,
  queried: vi.fn(),
  previewError: null as Error | null,
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: (options: { queryKey: unknown[] }) => {
    mocks.queried(options.queryKey)
    return {
      data: mocks.previewError ? undefined : mocks.preview,
      error: mocks.previewError,
      isLoading: mocks.preview === undefined && !mocks.previewError,
      refetch: mocks.refetch,
    }
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
      copyAddresses={{
        archive: 'contact@locatic.dev',
        me: 'admin@example.test',
      }}
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
    mocks.previewError = null
    mocks.refetch.mockReset()
  })

  it('shows a failed count with Retry instead of counting forever', async () => {
    const user = userEvent.setup()
    mocks.previewError = new Error('network')
    const { onSend } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain("Couldn't count recipients.")
    expect(screen.queryByText('Counting recipients…')).toBeNull()
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    const confirm = screen.getByRole('button', { name: /^Send to/ })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
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

    // Now (with the undo window), copied to the archive by default.
    expect(onSend).toHaveBeenCalledWith({ copy: 'archive' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers the archive, your own address or no copy', async () => {
    const user = userEvent.setup()
    const { onSend } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    const copy = screen.getByLabelText('Send a copy to')
    expect(
      within(copy)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['contact@locatic.dev', 'admin@example.test (you)', 'No copy'])
    await user.selectOptions(copy, 'me')
    await user.click(screen.getByRole('button', { name: 'Send to 2 people' }))
    expect(onSend).toHaveBeenCalledWith({ copy: 'me' })
  })

  it('schedules for a later time in the browser time zone', async () => {
    const user = userEvent.setup()
    const { onSend } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Review and send' }))
    await user.click(screen.getByRole('radio', { name: 'Later' }))
    const at = screen.getByLabelText('Send at') as HTMLInputElement
    expect(screen.getByText(/^Your time zone: /)).toBeTruthy()

    await user.clear(at)
    expect(screen.getByText('Pick a date and time.')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Schedule' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    const later = new Date(Date.now() + 2 * 60 * 60_000)
    later.setSeconds(0, 0)
    const pad = (value: number) => String(value).padStart(2, '0')
    await user.type(
      at,
      `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`,
    )
    await user.click(screen.getByRole('button', { name: /^Schedule for / }))
    expect(onSend).toHaveBeenCalledWith({
      copy: 'archive',
      sendAt: later.getTime(),
    })
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
