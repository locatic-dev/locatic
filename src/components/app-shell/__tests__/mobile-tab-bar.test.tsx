// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search: _search,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    search?: unknown
    to: string
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({
    location: {
      pathname: '/notifications',
    },
  }),
}))

vi.mock('@/features/explore/state', () => ({
  getFreshExploreSearch: () => ({ cityIds: [] }),
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
})
