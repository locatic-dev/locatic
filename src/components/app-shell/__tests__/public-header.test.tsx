// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routeContext } = vi.hoisted(() => ({
  routeContext: {
    auth: {
      isAuthenticated: false,
    },
  },
}))

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

vi.mock('@/routes/__root', () => ({
  Route: {
    useRouteContext: () => routeContext,
  },
}))

import { PublicHeader } from '../public-header'

describe('PublicHeader', () => {
  beforeEach(() => {
    routeContext.auth.isAuthenticated = false
  })

  it('shows sign in for anonymous visitors', () => {
    render(<PublicHeader />)

    expect(
      screen.getByRole('link', { name: 'sign in' }).getAttribute('href'),
    ).toBe('/sign-in/$')
    expect(screen.queryByRole('link', { name: 'home' })).toBeNull()
  })

  it('shows home instead of sign in for authenticated visitors', () => {
    routeContext.auth.isAuthenticated = true

    render(<PublicHeader />)

    expect(
      screen.getByRole('link', { name: 'home' }).getAttribute('href'),
    ).toBe('/home')
    expect(screen.queryByRole('link', { name: 'sign in' })).toBeNull()
  })
})
