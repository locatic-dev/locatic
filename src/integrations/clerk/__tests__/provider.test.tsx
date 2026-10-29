// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ provider: vi.fn(), pathname: '/' }))
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown
  }) => select({ location: { pathname: sdk.pathname } }),
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  ClerkProvider: ({ children, ...props }: { children: ReactNode }) => {
    sdk.provider(props)
    return children
  },
}))

vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_example')
const { default: AppClerkProvider } = await import('../provider')
afterEach(() => {
  cleanup()
  sdk.pathname = '/'
})

it('keeps session context available without prefetching the auth UI on public pages', () => {
  render(
    <AppClerkProvider>
      <p>public content</p>
    </AppClerkProvider>,
  )
  expect(screen.getByText('public content')).toBeTruthy()
  expect(sdk.provider).toHaveBeenCalledWith({
    publishableKey: 'pk_test_example',
    afterSignOutUrl: '/',
    prefetchUI: false,
  })
})

it.each(['/sign-in', '/sign-in/sso-callback', '/sign-up', '/home', '/about'])(
  'keeps built-in auth UI available on direct entry to %s',
  (pathname) => {
    sdk.pathname = pathname
    render(
      <AppClerkProvider>
        <p>content</p>
      </AppClerkProvider>,
    )
    expect(sdk.provider).toHaveBeenLastCalledWith(
      expect.objectContaining({ prefetchUI: true }),
    )
  },
)
