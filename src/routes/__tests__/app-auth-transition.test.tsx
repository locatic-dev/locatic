// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { Component, type ComponentType, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  pathname: '/home',
  signedIn: true,
  loaded: true,
  authenticated: true,
  viewer: true,
  lifecycle: null as string | null,
  error: false,
  navigate: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useNavigate: () => vi.fn(),
  }),
  useRouterState: ({ select }: { select: (value: unknown) => unknown }) =>
    select({ location: { pathname: state.pathname, href: state.pathname } }),
  useRouter: () => router,
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  Navigate: () => <div>redirecting to sign in</div>,
  Outlet: () =>
    state.pathname.startsWith('/project/') ? (
      <article>public project</article>
    ) : (
      <Home />
    ),
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isLoaded: state.loaded, isSignedIn: state.signedIn }),
}))
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({
    isAuthenticated: state.authenticated,
    isLoading: false,
  }),
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({ results: [], status: 'Exhausted' }),
}))
vi.mock('convex/react-clerk', () => ({
  ConvexProviderWithClerk: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/integrations/convex/client', () => ({ convexClient: {} }))
vi.mock('@/components/app-shell/app-layout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => (
    <div data-testid="member-shell">{children}</div>
  ),
}))
vi.mock('@/integrations/convex/metrics', () => ({
  useEmptyStateActionMetric: () => (action: () => void) => action,
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[1] === 'users:viewerBootstrap'
        ? { status: state.lifecycle, viewer: null }
        : undefined,
  }),
  useSuspenseQuery: ({ queryKey }: { queryKey: string[] }) => {
    switch (queryKey[1]) {
      case 'users:viewerBootstrap':
        return {
          data: {
            isAuthenticated: state.viewer,
            status: state.lifecycle ?? 'ready',
            viewer: state.viewer
              ? {
                  profile: { displayName: 'Ada', cityId: null },
                  github: { username: 'ada' },
                  stats: { followingCount: 1 },
                }
              : null,
          },
        }
      case 'home:list':
        if (state.error) throw new Error('Unauthorized')
        return { data: { page: [] } }
      default:
        return { data: { likedProjectIds: [] } }
    }
  },
}))
const router = { invalidate: vi.fn(), navigate: state.navigate }
const { Route: AppRoute } = await import('../_app')
const { Route: HomeRoute } = await import('../_app/home')
const App = AppRoute.options.component as ComponentType
const Home = HomeRoute.options.component as ComponentType
const HomeError = HomeRoute.options.errorComponent as ComponentType<{
  reset: () => void
}>
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <HomeError reset={() => {}} />
    ) : (
      this.props.children
    )
  }
}
function mountApp() {
  const client = new QueryClient()
  const tree = () => (
    <QueryClientProvider client={client}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  )
  const view = render(tree())
  return () => view.rerender(tree())
}
function expectNoFeedFallback() {
  expect(screen.queryByText("you're not following anyone yet.")).toBeNull()
  expect(screen.queryByText("couldn't load your feed.")).toBeNull()
}
beforeEach(() => {
  Object.assign(state, {
    pathname: '/home',
    signedIn: true,
    loaded: true,
    authenticated: true,
    viewer: true,
    lifecycle: null,
    error: false,
  })
})
afterEach(cleanup)

describe('mounted app authentication transitions', () => {
  it('removes private content and routes to recovery when the account is deleted in a mounted session', () => {
    const update = mountApp()
    state.lifecycle = 'deletion_pending'
    state.viewer = false
    update()

    expectNoFeedFallback()
    expect(screen.queryByTestId('member-shell')).toBeNull()
    expect(state.navigate).toHaveBeenCalledWith({
      to: '/sign-in/$',
      search: { redirect: '/home' },
      replace: true,
    })
  })
  it('does not render Home when viewer loss precedes the auth notification', () => {
    const update = mountApp()
    expect(
      screen.getByText(
        'nothing from the 1 person you follow in the last 30 days.',
      ),
    ).toBeTruthy()
    state.viewer = false
    update()
    expectNoFeedFallback()
    state.authenticated = false
    state.error = true
    update()
    expectNoFeedFallback()
  })
  it('redirects a private route when Clerk signs out before the viewer cache updates', () => {
    const update = mountApp()
    state.signedIn = false
    state.authenticated = false
    update()
    expect(state.navigate).toHaveBeenCalledWith({
      to: '/sign-in/$',
      search: { redirect: '/home' },
      replace: true,
    })
    state.viewer = false
    state.error = true
    update()
    expectNoFeedFallback()
  })
  it('still permits signed-out public project browsing', () => {
    Object.assign(state, {
      pathname: '/project/ada/engine',
      signedIn: false,
      authenticated: false,
      viewer: false,
    })
    mountApp()
    expect(screen.getByRole('article').textContent).toBe('public project')
    expect(screen.queryByText('redirecting to sign in')).toBeNull()
  })
  it('switches a public project from member shell to visitor content after session loss', () => {
    state.pathname = '/project/ada/engine'
    const update = mountApp()
    expect(screen.getByTestId('member-shell')).toBeTruthy()
    Object.assign(state, {
      signedIn: false,
      authenticated: false,
      viewer: false,
    })
    update()
    expect(screen.getByRole('article').textContent).toBe('public project')
    expect(screen.queryByTestId('member-shell')).toBeNull()
  })
})
