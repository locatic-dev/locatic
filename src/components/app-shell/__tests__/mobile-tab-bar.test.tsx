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
  it('keeps the notifications destination name without using replacement copy', () => {
    render(<MobileTabBar unreadNotifications={3} />)

    expect(screen.getByRole('link', { name: 'notifications' })).toBeTruthy()
    expect(screen.getByText('notifications')).toBeTruthy()
    expect(screen.queryByText('alerts')).toBeNull()
  })

  it('renders unread notification badges without changing the route target', () => {
    render(<MobileTabBar unreadNotifications={12} />)

    const notificationsLink = screen.getByRole('link', {
      name: 'notifications',
    })

    expect(notificationsLink.getAttribute('href')).toBe('/notifications')
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByLabelText('12 unread notifications')).toBeTruthy()
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
