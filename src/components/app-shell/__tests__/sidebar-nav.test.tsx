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
      href: '/home',
      pathname: '/home',
    },
  }),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useClerk: () => ({
    signOut: vi.fn(),
  }),
}))

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
      screen.getByRole('link', { name: 'Explore' }).getAttribute('data-search'),
    ).toBe(
      JSON.stringify({
        mode: 'builders',
        q: '',
        scope: 'custom',
        selectedCityIds: ['city_2'],
      }),
    )
    expect(
      screen.getByRole('link', { name: 'Home' }).getAttribute('data-search'),
    ).toBe('true')
  })
})
