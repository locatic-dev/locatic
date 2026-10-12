// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    to: string
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

import {
  EmailPreferencesSection,
  type EmailStatus,
} from '../email-preferences-section'

const status: EmailStatus = {
  productUpdates: true,
  weeklyDigest: false,
  emailVerified: true,
  blocked: null,
}

describe('EmailPreferencesSection', () => {
  it('shows both email switches with their descriptions', () => {
    render(<EmailPreferencesSection status={status} onChange={vi.fn()} />)

    const updates = screen.getByRole('switch', { name: 'Locatic updates' })
    expect(updates.getAttribute('aria-checked')).toBe('true')
    expect(
      screen.getByText(
        'Product news and announcements, a couple of times a month at most.',
      ),
    ).toBeTruthy()
    const digest = screen.getByRole('switch', { name: 'Weekly digest email' })
    expect(digest.getAttribute('aria-checked')).toBe('false')
    expect(
      screen.getByText("Not sending yet; we'll email you when it starts."),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Email campaigns' })).toBeNull()
  })

  it('reports one category per toggle', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<EmailPreferencesSection status={status} onChange={onChange} />)

    await user.click(screen.getByRole('switch', { name: 'Locatic updates' }))
    expect(onChange).toHaveBeenCalledWith('product_updates', false)
    await user.click(
      screen.getByRole('switch', { name: 'Weekly digest email' }),
    )
    expect(onChange).toHaveBeenCalledWith('weekly_digest', true)
  })

  it('says why email cannot arrive', () => {
    const { rerender } = render(
      <EmailPreferencesSection
        status={{ ...status, emailVerified: false }}
        onChange={vi.fn()}
      />,
    )
    expect(
      screen.getByText(
        'Verify your email in your account settings to receive email from Locatic.',
      ),
    ).toBeTruthy()

    for (const blocked of ['bounced', 'complained'] as const) {
      rerender(
        <EmailPreferencesSection
          status={{ ...status, blocked }}
          onChange={vi.fn()}
        />,
      )
      expect(
        screen.getByText(
          "Our email provider stopped delivering to this address after a spam report or bounce. Turning this on won't change that; contact us to fix it.",
        ),
      ).toBeTruthy()
    }
  })

  it('links email admins to the campaign workspace', () => {
    render(
      <EmailPreferencesSection
        status={status}
        onChange={vi.fn()}
        isEmailAdmin
      />,
    )
    expect(
      screen
        .getByRole('link', { name: 'Email campaigns' })
        .getAttribute('href'),
    ).toBe('/admin/emails')
  })

  it('keeps the switches off until the status loads', () => {
    render(<EmailPreferencesSection status={undefined} onChange={vi.fn()} />)
    expect(
      (
        screen.getByRole('switch', {
          name: 'Locatic updates',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
})
