// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { Component, Suspense, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const invalidate = vi.fn()

vi.mock('@tanstack/react-router', () => {
  return {
    createRootRouteWithContext: () => () => ({}),
    HeadContent: () => null,
    Link: ({
      children,
      search,
      to,
      ...props
    }: {
      children: ReactNode
      search?: { redirect?: string }
      to: string
    }) => (
      <a href={to} data-redirect={search?.redirect} {...props}>
        {children}
      </a>
    ),
    Scripts: () => null,
    useRouter: () => ({ invalidate }),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { href: string } }) => unknown
    }) => select({ location: { href: '/notifications?filter=unread' } }),
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

  it('renders diagnostics under the Vite dev server', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'development')
    const { RootErrorPage } = await import('../__root')

    render(
      <RootErrorPage error={new Error('Viewer not found')} reset={vi.fn()} />,
    )

    expect(screen.getByText('Viewer not found')).toBeTruthy()
  })

  it('hides diagnostics in a deployed development build', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'development')
    const { RootErrorPage } = await import('../__root')

    render(
      <RootErrorPage error={new Error('Viewer not found')} reset={vi.fn()} />,
    )

    expect(screen.getByText("couldn't load this page.")).toBeTruthy()
    expect(screen.queryByText('Viewer not found')).toBeNull()
  })

  it('sends an Unauthorized viewer to sign in again, back to this page', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')
    const { RootErrorPage } = await import('../__root')

    render(
      <RootErrorPage
        error={
          new Error(
            '[CONVEX Q(notifications:list)] [Request ID: 1] Server Error\nUncaught ConvexError: Unauthorized',
          )
        }
        reset={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'your session ended.' }),
    ).toBeTruthy()
    const signIn = screen.getByRole('link', { name: 'sign in again' })
    expect(signIn.getAttribute('href')).toMatch(/^\/sign-in\/\$/)
    expect(signIn.getAttribute('data-redirect')).toBe(
      '/notifications?filter=unread',
    )
    expect(screen.getByRole('link', { name: 'go home' })).toBeTruthy()
    // Sign-in stays the primary control; retry is the secondary way out.
    expect(signIn.className).toContain('bg-brand')
    expect(
      screen.getByRole('button', { name: 'retry' }).className,
    ).not.toContain('bg-brand')
  })

  it('keeps retry on the sign-in path so a live Clerk session cannot loop', async () => {
    // Clerk signed in but Convex says Unauthorized: /sign-in redirects straight
    // back, so retry (reset + invalidate) must still be reachable.
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')
    const reset = vi.fn()
    const { RootErrorPage } = await import('../__root')

    render(
      <RootErrorPage
        error={Object.assign(new Error('ConvexError'), {
          data: 'Unauthorized',
        })}
        reset={reset}
      />,
    )

    expect(screen.getByRole('link', { name: 'sign in again' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))

    expect(reset).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('refetches a failed suspense query when retrying', async () => {
    // Real React Query: the private routes (inbox, notifications, settings)
    // skip their client loader prefetch, so the failed suspense query stays
    // cached in the error state. Retry must clear React Query's error reset
    // boundary, or the remounted query rethrows the cached error.
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { RootErrorPage } = await import('../__root')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const queryFn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Server Error'))
      .mockResolvedValueOnce('inbox loaded')

    function Inbox() {
      const { data } = useSuspenseQuery({ queryKey: ['inbox'], queryFn })
      return <p>{data}</p>
    }

    render(
      <QueryClientProvider client={queryClient}>
        <RouteCatchBoundary
          errorComponent={(error, reset) => (
            <RootErrorPage error={error} reset={reset} />
          )}
        >
          <Suspense fallback={<p>loading</p>}>
            <Inbox />
          </Suspense>
        </RouteCatchBoundary>
      </QueryClientProvider>,
    )

    expect(await screen.findByText("couldn't load this page.")).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'sign in again' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'retry' }))

    expect(await screen.findByText('inbox loaded')).toBeTruthy()
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})

/** Stands in for the router's CatchBoundary: `reset` remounts the children. */
class RouteCatchBoundary extends Component<
  {
    children: ReactNode
    errorComponent: (error: Error, reset: () => void) => ReactNode
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    return this.state.error
      ? this.props.errorComponent(this.state.error, () =>
          this.setState({ error: null }),
        )
      : this.props.children
  }
}
