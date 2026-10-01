// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
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
      href: '/notifications',
      pathname: '/notifications',
    },
  }),
}))

vi.mock('@/features/explore/state', () => ({
  useResumeExploreSearch: () => ({
    mode: 'posts',
    q: 'react',
    scope: 'custom',
    selectedCityIds: ['city_1'],
  }),
}))

import { MobileTabBar } from '../mobile-tab-bar'

describe('MobileTabBar', () => {
  it('lists the tabs in the same order as the desktop sidebar', () => {
    render(<MobileTabBar />)

    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual(['/home', '/explore', '/inbox', '/notifications', '/profile'])
  })

  it('shows the short "alerts" caption but keeps "notifications" as the name', () => {
    render(<MobileTabBar unreadNotifications={0} />)

    const link = screen.getByRole('link', { name: 'notifications' })
    expect(link.getAttribute('href')).toBe('/notifications')
    expect(link.textContent).toBe('alerts')
  })

  it('includes unread counts in the link names without changing the route target', () => {
    render(<MobileTabBar unreadNotifications={12} unreadMessages={1} />)

    expect(
      screen
        .getByRole('link', { name: 'notifications, 12 unread' })
        .getAttribute('href'),
    ).toBe('/notifications')
    expect(
      screen
        .getByRole('link', { name: 'inbox, 1 unread' })
        .getAttribute('href'),
    ).toBe('/inbox')
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('announces 99+ at the server unread cap, matching the badge', () => {
    const { rerender } = render(<MobileTabBar unreadNotifications={99} />)

    expect(
      screen.getByRole('link', { name: 'notifications, 99 unread' }),
    ).toBeTruthy()

    // `notifications.unreadCount` stops counting at 100.
    rerender(<MobileTabBar unreadNotifications={100} />)

    expect(
      screen.getByRole('link', { name: 'notifications, 99+ unread' }),
    ).toBeTruthy()
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('uses resumed Explore search for the Explore tab only', () => {
    render(<MobileTabBar />)

    expect(
      screen.getByRole('link', { name: 'explore' }).getAttribute('data-search'),
    ).toBe(
      JSON.stringify({
        mode: 'posts',
        q: 'react',
        scope: 'custom',
        selectedCityIds: ['city_1'],
      }),
    )
    expect(
      screen
        .getByRole('link', { name: 'notifications' })
        .getAttribute('data-search'),
    ).toBe('true')
  })
})
