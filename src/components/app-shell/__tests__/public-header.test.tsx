// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { location, routeContext } = vi.hoisted(() => ({
  location: { pathname: '/', href: '/' },
  routeContext: {
    auth: {
      isAuthenticated: false,
    },
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    search?: { redirect?: string }
    to: string
  }) => (
    <a
      href={
        search?.redirect
          ? `${to}?${new URLSearchParams({ redirect: search.redirect })}`
          : to
      }
      {...props}
    >
      {children}
    </a>
  ),
  rootRouteId: '__root__',
  useRouteContext: ({
    select,
  }: {
    select: (context: typeof routeContext) => unknown
  }) => select(routeContext),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: typeof location }) => unknown
  }) => select({ location }),
}))

import { PublicHeader, getPublicAuthRedirect } from '../public-header'

function hrefOf(name: string) {
  return screen.getByRole('link', { name }).getAttribute('href')
}

describe('PublicHeader', () => {
  beforeEach(() => {
    routeContext.auth.isAuthenticated = false
    location.pathname = '/'
    location.href = '/'
  })

  it('offers sign in and sign up to visitors without a destination on the landing page', () => {
    render(<PublicHeader />)

    expect(hrefOf('sign in')).toBe('/sign-in/$')
    expect(hrefOf('sign up')).toBe('/sign-up/$')
    expect(screen.queryByRole('link', { name: 'home' })).toBeNull()
  })

  it('links visitors to public Explore, except on Explore itself', () => {
    const { unmount } = render(<PublicHeader />)
    expect(hrefOf('explore')).toBe('/explore')
    unmount()

    location.pathname = '/explore'
    location.href = '/explore'
    render(<PublicHeader />)
    expect(screen.queryByRole('link', { name: 'explore' })).toBeNull()
  })

  it('labels its landmark as site navigation, not account', () => {
    render(<PublicHeader />)

    expect(screen.getByRole('navigation', { name: 'Site' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Account' })).toBeNull()
  })

  it('keeps explore visible on phones on every public page, landing included', () => {
    for (const path of ['/', '/privacy', '/u/ada', '/c/bengaluru']) {
      location.pathname = path
      location.href = path
      const { unmount: unmountPage } = render(<PublicHeader />)
      expect(
        screen.getByRole('link', { name: 'explore' }).className,
      ).not.toContain('max-sm:hidden')
      unmountPage()
    }
  })

  it('returns visitors to the public page they signed in from', () => {
    location.pathname = '/explore'
    location.href = '/explore?mode=builders&scope=global'

    render(<PublicHeader />)

    const expected = `?${new URLSearchParams({
      redirect: '/explore?mode=builders&scope=global',
    })}`
    expect(hrefOf('sign in')).toBe(`/sign-in/$${expected}`)
    expect(hrefOf('sign up')).toBe(`/sign-up/$${expected}`)
  })

  it('shows home instead of sign in for authenticated visitors', () => {
    routeContext.auth.isAuthenticated = true

    render(<PublicHeader />)

    expect(hrefOf('home')).toBe('/home')
    expect(screen.queryByRole('link', { name: 'sign in' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'sign up' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'explore' })).toBeNull()
  })
})

describe('getPublicAuthRedirect', () => {
  it('drops the landing page and unsafe values', () => {
    expect(getPublicAuthRedirect('/', '/')).toBeUndefined()
    expect(getPublicAuthRedirect('/sign-in', '/sign-in')).toBeUndefined()
    expect(getPublicAuthRedirect('/privacy', '/privacy#cookies')).toBe(
      '/privacy#cookies',
    )
  })
})
