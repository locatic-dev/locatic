// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  search: { t: '' },
  unsubscribe: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useSearch: () => mocks.search,
    }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/components/app-shell/public-header', () => ({
  PublicHeader: () => null,
}))
vi.mock('@/components/app-shell/public-footer', () => ({
  PublicFooter: () => null,
}))
vi.mock('@/features/email-preferences/mutations', () => ({
  useUnsubscribeWithToken: () => mocks.unsubscribe,
  useStopAllWithToken: () => vi.fn(),
}))

import { Route } from '../unsubscribe'

const UnsubscribeRoute = (
  Route as unknown as {
    options: { component: ComponentType }
  }
).options.component

describe('/unsubscribe route', () => {
  beforeEach(() => {
    mocks.unsubscribe.mockReset()
    mocks.search = { t: 'a.product_updates.sig' }
  })

  it('starts over for a new token and ignores a late answer for the old one', async () => {
    const user = userEvent.setup()
    let answerOld!: (value: unknown) => void
    mocks.unsubscribe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerOld = resolve
        }),
    )
    const { rerender } = render(<UnsubscribeRoute />)
    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))

    mocks.search = { t: 'b.weekly_digest.sig' }
    rerender(<UnsubscribeRoute />)
    await act(async () => {
      answerOld({ status: 'unsubscribed', category: 'product_updates' })
    })

    expect(
      screen.getByRole('heading', {
        name: 'Stop the weekly digest for this address?',
      }),
    ).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Unsubscribe' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('resets a finished unsubscribe when the token changes', async () => {
    const user = userEvent.setup()
    mocks.unsubscribe.mockResolvedValue({
      status: 'unsubscribed',
      category: 'product_updates',
    })
    const { rerender } = render(<UnsubscribeRoute />)
    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(screen.getByRole('status')).toBeTruthy()

    mocks.search = { t: 'c.product_updates.sig' }
    rerender(<UnsubscribeRoute />)

    expect(
      screen.getByRole('heading', {
        name: 'Stop Locatic updates for this address?',
      }),
    ).toBeTruthy()
  })
})
