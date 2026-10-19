// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  unsubscribe: vi.fn(),
  stopAll: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    to: string
    search?: Record<string, string>
  }) => (
    <a
      href={`${to}${search ? `?${new URLSearchParams(search)}` : ''}`}
      {...props}
    >
      {children}
    </a>
  ),
}))

vi.mock('../mutations', () => ({
  useUnsubscribeWithToken: () => mocks.unsubscribe,
  useStopAllWithToken: () => mocks.stopAll,
}))

import { UnsubscribeCard } from '../unsubscribe-page'

describe('UnsubscribeCard', () => {
  beforeEach(() => {
    mocks.unsubscribe.mockReset()
    mocks.stopAll.mockReset()
  })

  it('changes nothing until the button is pressed', () => {
    render(<UnsubscribeCard token="t.product_updates.sig" />)

    expect(
      screen.getByRole('heading', {
        name: 'Stop Locatic updates for this address?',
      }),
    ).toBeTruthy()
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    expect(mocks.stopAll).not.toHaveBeenCalled()
  })

  it('unsubscribes once and then offers to stop everything', async () => {
    const user = userEvent.setup()
    mocks.unsubscribe.mockResolvedValue({
      status: 'unsubscribed',
      category: 'product_updates',
    })
    render(<UnsubscribeCard token="t.product_updates.sig" />)

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))

    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1)
    expect(mocks.unsubscribe).toHaveBeenCalledWith({
      token: 't.product_updates.sig',
    })
    expect(screen.getByRole('status').textContent).toContain(
      "You're unsubscribed from Locatic updates.",
    )
    expect(
      screen
        .getByRole('link', { name: 'Manage email in settings' })
        .getAttribute('href'),
    ).toBe('/settings?tab=notifications')
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull()

    mocks.stopAll.mockResolvedValue({
      status: 'unsubscribed',
      category: 'product_updates',
    })
    await user.click(
      screen.getByRole('button', { name: 'Stop all Locatic email' }),
    )
    expect(mocks.stopAll).toHaveBeenCalledWith({
      token: 't.product_updates.sig',
    })
    expect(screen.getByRole('status').textContent).toContain(
      "You won't get any more Locatic email.",
    )
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull()
  })

  it('names the weekly digest when that is what the link was for', async () => {
    const user = userEvent.setup()
    mocks.unsubscribe.mockResolvedValue({
      status: 'unsubscribed',
      category: 'weekly_digest',
    })
    render(<UnsubscribeCard token="t.weekly_digest.sig" />)

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(screen.getByRole('status').textContent).toContain(
      "You're unsubscribed from the weekly digest.",
    )
  })

  it('explains an invalid link and offers no buttons', async () => {
    const user = userEvent.setup()
    mocks.unsubscribe.mockResolvedValue({ status: 'invalid' })
    render(<UnsubscribeCard token="bad" />)

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(screen.getByRole('alert').textContent).toContain(
      "This link doesn't work. Manage email from Settings after signing in.",
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('treats a missing token as an invalid link without calling the server', () => {
    render(<UnsubscribeCard token="" />)
    expect(screen.getByRole('alert').textContent).toContain(
      "This link doesn't work.",
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('lets the reader retry after a failed request', async () => {
    const user = userEvent.setup()
    mocks.unsubscribe
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        status: 'unsubscribed',
        category: 'product_updates',
      })
    render(<UnsubscribeCard token="t.product_updates.sig" />)

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(screen.getByRole('alert').textContent).toContain(
      "That didn't work. Try again.",
    )
    const retry = screen.getByRole('button', { name: 'Unsubscribe' })
    expect((retry as HTMLButtonElement).disabled).toBe(false)
    await user.click(retry)
    expect(screen.getByRole('status').textContent).toContain(
      "You're unsubscribed",
    )
  })
})
