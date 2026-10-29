// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type QueryOptions = { queryKey: [string, string, unknown] }

const mocks = vi.hoisted(() => ({
  completeOnboarding: vi.fn(),
  navigate: vi.fn(),
  search: {} as { redirect?: string },
  lifecycle: null as string | null,
  listGithubRepositories: vi.fn().mockResolvedValue([]),
  importSelectedRepositories: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => mocks.navigate,
      useSearch: () => mocks.search,
    }),
  redirect: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey: [, functionName] }: QueryOptions) =>
    functionName === 'users:viewerBootstrap'
      ? {
          data: {
            isAuthenticated: true,
            status: mocks.lifecycle,
            needsOnboarding: true,
            viewer: {
              _id: 'user_viewer',
              github: { username: 'newbie' },
              profile: { bio: '', displayName: 'New Builder', cityId: null },
            },
          },
        }
      : functionName === 'projects:listMine'
        ? { data: [], refetch: vi.fn().mockResolvedValue({ data: [] }) }
        : { data: undefined },
}))

vi.mock('@/features/onboarding/mutations', () => ({
  useCompleteOnboarding: () => mocks.completeOnboarding,
}))

vi.mock('@/features/github/actions', () => ({
  useImportSelectedRepositories: () => mocks.importSelectedRepositories,
  useListGithubRepositories: () => mocks.listGithubRepositories,
}))

vi.mock('@/features/follows/mutations', () => ({
  useFollowUser: () => vi.fn(),
  useUnfollowUser: () => vi.fn(),
}))

const { Route } = await import('../onboarding')
const OnboardingPage = Route.options.component as ComponentType

async function finishWithSkips() {
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OnboardingPage />
    </QueryClientProvider>,
  )
  await user.click(screen.getByRole('button', { name: "can't find my city" }))
  await user.click(screen.getByRole('button', { name: /continue/ }))
  await user.click(screen.getByRole('button', { name: 'skip for now' }))
  await user.click(screen.getByRole('button', { name: 'skip for now' }))
  await user.click(screen.getByRole('button', { name: 'skip for now' }))
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalled())
}

describe('onboarding completion', () => {
  afterEach(() => {
    mocks.search = {}
    mocks.lifecycle = null
    vi.clearAllMocks()
    cleanup()
  })

  it('goes to the preserved destination, query and hash included', async () => {
    mocks.completeOnboarding.mockResolvedValue(null)
    mocks.search = { redirect: '/project/ada/engine?post=p1#post-p1' }

    await finishWithSkips()

    expect(mocks.navigate).toHaveBeenCalledWith({
      href: '/project/ada/engine?post=p1#post-p1',
    })
  })

  it('falls back to Explore without a destination', async () => {
    mocks.completeOnboarding.mockResolvedValue(null)

    await finishWithSkips()

    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/explore' }),
    )
  })

  it('leaves onboarding if deletion arrives while it is mounted', async () => {
    const client = new QueryClient()
    const tree = () => (
      <QueryClientProvider client={client}>
        <OnboardingPage />
      </QueryClientProvider>
    )
    const view = render(tree())
    mocks.lifecycle = 'deletion_pending'
    await act(async () => view.rerender(tree()))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/sign-in/$',
      search: { redirect: undefined },
      replace: true,
    })
    expect(screen.queryByRole('button', { name: /continue/ })).toBeNull()
  })
})
