// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    search?: unknown
    to: string
  }) => (
    <a href={to} data-search={JSON.stringify(search)} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({
    location: {
      href: '/home',
      pathname: '/home',
    },
  }),
}))

const signOut = vi.hoisted(() => vi.fn())
vi.mock('@/integrations/clerk/sign-out', () => ({ useSignOut: () => signOut }))

vi.mock('@/features/explore/state', () => ({
  useResumeExploreSearch: () => ({
    mode: 'builders',
    q: '',
    scope: 'custom',
    selectedCityIds: ['city_2'],
  }),
}))

import { SidebarNav } from '../sidebar-nav'

describe('SidebarNav', () => {
  it('uses resumed Explore search for the Explore nav item only', () => {
    render(<SidebarNav />)

    expect(
      screen.getByRole('link', { name: 'explore' }).getAttribute('data-search'),
    ).toBe(
      JSON.stringify({
        mode: 'builders',
        q: '',
        scope: 'custom',
        selectedCityIds: ['city_2'],
      }),
    )
    expect(
      screen.getByRole('link', { name: 'home' }).getAttribute('data-search'),
    ).toBe('true')
  })

  it('names the Notifications link with its unread count', () => {
    const { rerender } = render(<SidebarNav unreadNotifications={3} />)

    expect(
      screen.getByRole('link', { name: 'notifications, 3 unread' }),
    ).toBeTruthy()

    rerender(<SidebarNav unreadNotifications={100} />)

    expect(
      screen.getByRole('link', { name: 'notifications, 99+ unread' }),
    ).toBeTruthy()

    rerender(<SidebarNav unreadNotifications={0} />)

    expect(screen.getByRole('link', { name: 'notifications' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /unread/ })).toBeNull()
  })
})

describe('AccountMenu', () => {
  const viewer = { displayName: 'Ada', githubUsername: 'ada' }

  it.each([false, true])(
    'opens About from the account menu when isEmailAdmin is %s',
    async (isEmailAdmin) => {
      const user = userEvent.setup()
      render(<SidebarNav viewer={viewer} isEmailAdmin={isEmailAdmin} />)

      await user.click(screen.getByRole('button', { name: 'Account menu' }))
      expect(screen.getByRole('menuitem', { name: 'settings' })).toBeTruthy()
      expect(
        screen.queryByRole('menuitem', { name: 'email campaigns' }) !== null,
      ).toBe(isEmailAdmin)

      await user.click(screen.getByRole('menuitem', { name: 'about' }))
      expect(
        await screen.findByRole('dialog', {
          name: 'It started with a question',
        }),
      ).toBeTruthy()
    },
  )

  it('offers email campaigns to email admins only', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<SidebarNav viewer={viewer} isEmailAdmin />)

    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(
      screen
        .getByRole('menuitem', { name: 'email campaigns' })
        .getAttribute('href'),
    ).toBe('/admin/emails')
    unmount()

    render(<SidebarNav viewer={viewer} />)
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menuitem', { name: 'settings' })).toBeTruthy()
    expect(
      screen.queryByRole('menuitem', { name: 'email campaigns' }),
    ).toBeNull()
  })
})

it('uses the shared sign-out action from the desktop account menu', async () => {
  const user = userEvent.setup()
  render(<SidebarNav viewer={{ displayName: 'Ada', githubUsername: 'ada' }} />)
  await user.click(screen.getByRole('button', { name: 'Account menu' }))
  await user.click(screen.getByRole('menuitem', { name: 'sign out' }))
  expect(signOut).toHaveBeenCalledOnce()
})
