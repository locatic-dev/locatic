// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const invalidate = vi.fn()

vi.mock('@tanstack/react-router', () => {
  return {
    createRootRouteWithContext: () => () => ({}),
    HeadContent: () => null,
    Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    Scripts: () => null,
    useRouter: () => ({ invalidate }),
  }
})

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (fn: unknown) => fn,
  }),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: vi.fn(),
}))

vi.mock('../../integrations/clerk/provider', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../../integrations/convex/provider', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

describe('RootErrorPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    invalidate.mockReset()
  })

  it('does not render Convex diagnostics in production', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')
    const { RootErrorPage } = await import('../__root')

    render(
      <RootErrorPage
        error={
          new Error(
            'ConvexError: Viewer not found\n    at users:viewerLikedProjectIds',
          )
        }
        reset={vi.fn()}
      />,
    )

    expect(screen.getByText("couldn't load this page.")).toBeTruthy()
    expect(screen.queryByText(/Viewer not found/)).toBeNull()
    expect(screen.queryByText(/ConvexError/)).toBeNull()
    expect(screen.queryByText(/users:viewerLikedProjectIds/)).toBeNull()
  })

  it('renders diagnostics in development mode', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'development')
    const { RootErrorPage } = await import('../__root')

    render(
      <RootErrorPage error={new Error('Viewer not found')} reset={vi.fn()} />,
    )

    expect(screen.getByText('Viewer not found')).toBeTruthy()
  })

  it('resets and invalidates the router when retrying', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')
    const reset = vi.fn()
    const { RootErrorPage } = await import('../__root')

    render(
      <RootErrorPage error={new Error('Viewer not found')} reset={reset} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'retry' }))

    expect(reset).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})
