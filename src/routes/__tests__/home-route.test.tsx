// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, Suspense, type ComponentType, type ReactNode } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

type QueryOptions = { queryKey: [string, string, unknown] }

const mocks = vi.hoisted(() => ({
  followingCount: 0,
  invalidate: vi.fn(),
  nearby: [] as unknown[],
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => vi.fn(),
    }),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}))

vi.mock('convex/react', () => ({
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({ results: [], status: 'Exhausted' }),
}))

vi.mock('@/features/follows/mutations', () => ({
  useFollowUser: () => vi.fn(),
  useUnfollowUser: () => vi.fn(),
}))

vi.mock('@/integrations/convex/metrics', () => ({
  useEmptyStateActionMetric: () => (action: () => void) => action,
}))

const { Route } = await import('../_app/home')
const HomePage = Route.options.component as ComponentType
const HomeErrorPage = Route.options.errorComponent as ComponentType<
  Partial<ErrorComponentProps>
>

class TestErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <HomeErrorPage reset={() => this.setState({ failed: false })} />
    ) : (
      this.props.children
    )
  }
}

describe('Home error recovery', () => {
  it('retries a failed feed and shows it once the query resolves', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue('feed loaded')
    function Feed() {
      const { data } = useSuspenseQuery({ queryKey: ['home-feed'], queryFn })
      return <p>{data}</p>
    }
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <TestErrorBoundary>
          <Suspense fallback={<p>loading</p>}>
            <Feed />
          </Suspense>
        </TestErrorBoundary>
      </QueryClientProvider>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'retry' }))

    expect(await screen.findByText('feed loaded')).toBeTruthy()
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(mocks.invalidate).toHaveBeenCalled()
  })
})

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  const suspenseData = (functionName: string) => {
    switch (functionName) {
      case 'home:list':
        return { page: [] }
      case 'users:viewerLikedProjectIds':
        return { likedProjectIds: [] }
      case 'users:viewerBootstrap':
        return {
          viewer: {
            profile: { cityId: 'city_berlin' },
            stats: { followingCount: mocks.followingCount },
          },
        }
      default:
        return undefined
    }
  }
  return {
    ...actual,
    // Route queries resolve from fixtures; other suspense queries (the error
    // recovery test's) run for real.
    useSuspenseQuery: (options: QueryOptions) =>
      options.queryKey[0] === 'convexQuery'
        ? { data: suspenseData(options.queryKey[1]) }
        : actual.useSuspenseQuery(options as never),
    useQuery: (options: QueryOptions) =>
      options.queryKey[1] === 'users:suggestOnboardingBuilders'
        ? { data: options.queryKey[2] === 'skip' ? undefined : mocks.nearby }
        : { data: undefined },
  }
})

const builder = {
  avatarUrl: null,
  buildStatus: 'building_solo',
  displayName: 'Ada',
  githubUsername: 'ada',
  isNewBuilder: false,
  location: { kind: 'none' },
  projectsCount: 2,
  userId: 'user_ada',
  viewerIsFollowing: false,
}

function renderHome() {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <HomePage />
    </QueryClientProvider>,
  )
  const rerender = () =>
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <HomePage />
      </QueryClientProvider>,
    )
  return { rerender }
}

describe('Home builders near you', () => {
  afterEach(() => {
    mocks.followingCount = 0
    mocks.nearby = []
  })

  it('stays after the first follow turns "no follows" into a quiet feed', async () => {
    mocks.nearby = [builder]
    const { rerender } = renderHome()
    expect(
      screen.getByRole('region', { name: 'builders near you' }),
    ).toBeTruthy()

    mocks.followingCount = 1
    rerender()

    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'nothing from the 1 person you follow in the last 30 days.',
        }),
      ).toBeTruthy(),
    )
    expect(
      screen.getByRole('region', { name: 'builders near you' }),
    ).toBeTruthy()
  })

  it('is not offered to a member who already follows people', () => {
    mocks.followingCount = 3
    mocks.nearby = [builder]
    renderHome()

    expect(
      screen.queryByRole('region', { name: 'builders near you' }),
    ).toBeNull()
  })
})
