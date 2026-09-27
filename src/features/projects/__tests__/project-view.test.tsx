// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type {
  ProjectDetailPayload,
  ViewerBootstrapPayload,
} from '@/features/contracts'
import {
  moreFromOwnerCityQueryOptions,
  projectSignalsQueryOptions,
} from '@/features/projects/queries'
import {
  viewerQueryOptions,
  viewerSummaryQueryOptions,
} from '@/features/viewer/queries'

const mocks = vi.hoisted(() => ({
  detail: null as unknown,
  refreshMetadata: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useParams: () => ({ owner: 'ada', repo: 'engine' }),
    }),
  getRouteApi: () => ({
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
  }),
  Link: ({ children, to }: { children: ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
  notFound: () => ({ isNotFound: true }),
  redirect: vi.fn(),
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useSuspenseQuery: () => ({ data: mocks.detail }),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isSignedIn: false }),
}))

vi.mock('convex/react', () => ({
  useAction: () => mocks.refreshMetadata,
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({
    isLoading: false,
    loadMore: vi.fn(),
    results: [],
    status: 'Exhausted',
  }),
  useQuery: () => undefined,
}))

vi.mock('@/features/inbox/use-open-conversation', () => ({
  useOpenConversation: () => ({
    openConversation: vi.fn(),
    pendingUserId: null,
  }),
}))

const projectDetail = {
  canonicalRoute: { owner: 'ada', repo: 'engine' },
  comments: [],
  owner: {
    avatarUrl: '',
    buildStatus: 'building',
    city: null,
    displayName: 'Ada',
    githubUsername: 'ada',
    socialLinks: {},
    userId: 'user_1' as Id<'users'>,
  },
  project: {
    _id: 'project_1' as Id<'projects'>,
    github: {
      description: 'analytical engine',
      fullName: 'ada/engine',
      languages: [],
      lastCommitAt: 0,
      primaryLanguage: null,
      readmePreview: '',
      stargazersCount: 3,
      topics: [],
    },
    locatic: { commentsCount: 0, postsCount: 0, tags: [] },
  },
  reactionCounts: {},
  releases: [],
  viewerFollowsOwner: false,
  viewerHasLiked: false,
  viewerReactionTypes: [],
} as unknown as ProjectDetailPayload

const signedInViewerBootstrap = {
  isAuthenticated: true,
  needsOnboarding: false,
  viewer: {
    _id: 'user_2',
    github: { username: 'grace' },
    profile: { avatarUrl: '', displayName: 'Grace' },
  },
} as unknown as ViewerBootstrapPayload

async function renderProjectRoute(
  seed: (queryClient: QueryClient) => void = () => {},
) {
  const { Route } = await import('@/routes/_app/project.$owner.$repo')
  const ProjectDetailPage = Route.options.component as () => ReactNode
  const queryClient = new QueryClient()
  seed(queryClient)
  const page = () => (
    <QueryClientProvider client={queryClient}>
      <ProjectDetailPage />
    </QueryClientProvider>
  )

  return { page, ...render(page()) }
}

describe('project route', () => {
  it('shows not found without breaking hook order when the project disappears while mounted', async () => {
    mocks.detail = projectDetail
    const { page, rerender } = await renderProjectRoute()

    expect(
      screen.getByRole('heading', { level: 1, name: 'engine' }),
    ).toBeTruthy()

    mocks.detail = null
    expect(() => rerender(page())).not.toThrow()
    expect(
      screen.getByRole('heading', { level: 1, name: 'project not found' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('heading', { level: 1, name: 'engine' }),
    ).toBeNull()
    const main = screen.getByRole('main')
    expect(main.id).toBe('main-content')
    expect(
      screen
        .getByRole('link', { name: 'explore projects' })
        .getAttribute('href'),
    ).toBe('/explore')
  })

  it('throws notFound from the loader when the project does not resolve', async () => {
    const { Route } = await import('@/routes/_app/project.$owner.$repo')
    const loader = Route.options.loader as (args: unknown) => Promise<unknown>

    await expect(
      loader({
        context: { queryClient: { ensureQueryData: async () => null } },
        location: { hash: '', search: {} },
        params: { owner: 'ada', repo: 'missing' },
      }),
    ).rejects.toEqual({ isNotFound: true })
  })

  it('leaves the main landmark to the app shell for signed-in viewers', async () => {
    const { Route } = await import('@/routes/_app/project.$owner.$repo')
    const ProjectNotFound = Route.options.notFoundComponent as () => ReactNode
    const queryClient = new QueryClient()
    queryClient.setQueryData(
      viewerQueryOptions().queryKey,
      signedInViewerBootstrap,
    )

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectNotFound />
      </QueryClientProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'project not found' }),
    ).toBeTruthy()
    expect(screen.queryByRole('main')).toBeNull()
  })

  describe('header and owner panel', () => {
    const DAY = 24 * 60 * 60 * 1000
    const projectId = 'project_1' as Id<'projects'>

    function seedSignals(
      syncStatus: Record<string, unknown>,
      viewerId: string | null,
    ) {
      return (queryClient: QueryClient) => {
        queryClient.setQueryData(
          projectSignalsQueryOptions(projectId).queryKey,
          {
            latestUpdate: {
              kind: 'release',
              at: Date.now() - 3 * DAY,
              label: 'v1.2',
            },
            ownerBuildStatus: 'open_to_collab',
            ownerLocation: {
              kind: 'city',
              cityId: 'city_1',
              cityName: 'Bengaluru, Karnataka, India',
              regionLabel: 'Karnataka, India',
            },
            syncStatus,
          },
        )
        if (viewerId) {
          queryClient.setQueryData(viewerSummaryQueryOptions().queryKey, {
            avatarUrl: '',
            displayName: 'Ada',
            viewerId,
          })
        }
      }
    }

    it('shows visitors the latest update and sync freshness, without owner controls', async () => {
      mocks.detail = projectDetail
      await renderProjectRoute(
        seedSignals(
          { kind: 'fresh', at: Date.now() - DAY, hasReadme: false },
          null,
        ),
      )

      expect(screen.getByText('released v1.2 · 3d ago')).toBeTruthy()
      expect(screen.getByText('updated 1d ago · no README')).toBeTruthy()
      expect(screen.getByText('Bengaluru, Karnataka, India')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /refresh/ })).toBeNull()
    })

    it('gives the owner the failure reason and a retry that refreshes from GitHub', async () => {
      mocks.detail = projectDetail
      mocks.refreshMetadata.mockResolvedValue(null)
      await renderProjectRoute(
        seedSignals(
          {
            kind: 'failed',
            at: Date.now() - 4 * DAY,
            hasReadme: true,
            error: 'GitHub request failed: 404',
          },
          'user_1',
        ),
      )

      expect(
        screen.getByText(
          'last refresh from GitHub failed: GitHub request failed: 404',
        ),
      ).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'retry refresh' }))
      expect(mocks.refreshMetadata).toHaveBeenCalledWith({ projectId })
    })

    it('lists more projects from the owner city', async () => {
      mocks.detail = projectDetail
      await renderProjectRoute((queryClient) => {
        queryClient.setQueryData(
          moreFromOwnerCityQueryOptions(projectId).queryKey,
          {
            cityId: 'city_1',
            cityName: 'Bengaluru',
            projects: [
              {
                projectId: 'project_2',
                ownerUserId: 'user_3',
                fullName: 'bob/cli',
                owner: 'bob',
                repo: 'cli',
                description: null,
                primaryLanguage: null,
                languages: [],
                githubStars: 0,
                locaticLikes: 0,
                reactionCounts: {},
                commentsCount: 0,
                postsCount: 0,
                topics: [],
                lastCommitAt: Date.now() - DAY,
                updatedAt: Date.now() - DAY,
                authorName: 'Bob',
                authorHandle: 'bob',
                authorAvatarUrl: null,
                cityLabel: 'Bengaluru, Karnataka, India',
                cityVisibilityState: 'exact_city',
              },
            ],
          },
        )
      })

      expect(
        screen.getByRole('heading', { level: 2, name: 'more from Bengaluru' }),
      ).toBeTruthy()
      expect(screen.getByText('cli')).toBeTruthy()
    })
  })
})
