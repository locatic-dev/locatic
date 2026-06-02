// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: forwardRef<
    HTMLAnchorElement,
    AnchorHTMLAttributes<HTMLAnchorElement> & {
      children: ReactNode
      search?: { tab?: string }
      to: string
    }
  >(function MockLink({ children, search, to, ...props }, ref) {
    const href = search?.tab ? `${to}?tab=${search.tab}` : to
    return (
      <a href={href} ref={ref} {...props}>
        {children}
      </a>
    )
  }),
}))

import { ProfileMobileAccountActions } from '../mobile-account-actions'

describe('ProfileMobileAccountActions', () => {
  it('links mobile users to account settings', () => {
    render(<ProfileMobileAccountActions onSignOut={vi.fn()} />)

    const settingsLink = screen.getByRole('link', { name: /settings/i })

    expect(settingsLink.getAttribute('href')).toBe('/settings?tab=account')
  })

  it('exposes a sign out action', () => {
    const handleSignOut = vi.fn()

    render(<ProfileMobileAccountActions onSignOut={handleSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))

    expect(handleSignOut).toHaveBeenCalledTimes(1)
  })
})
