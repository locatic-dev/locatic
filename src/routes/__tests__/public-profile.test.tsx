// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { publicProfileOverviewQueryOptions } from '@/features/profile/queries'
import type { PublicProfileOverview } from '@/features/profile/types'

const mocks = vi.hoisted(() => {
  const toastError = vi.fn()
  return {
    followUser: vi.fn(),
    isSignedIn: true,
    overview: null as unknown,
    toast: Object.assign(vi.fn(), { error: toastError }),
    toastError,
    unfollowUser: vi.fn(),
  }
})

vi.mock('sonner', () => ({ toast: mocks.toast }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => vi.fn(),
      useParams: () => ({ username: 'ada' }),
      useSearch: () => ({ tab: 'projects', network: 'followers' }),
    }),
  Link: ({
    children,
    search,
    to,
    ...props
  }: {
    children: ReactNode
    search?: unknown
    to: string
  }) => (
    <a
      {...props}
      data-search={JSON.stringify(search ?? null)}
      data-to={to}
      href={to}
    >
      {children}
    </a>
  ),
  notFound: () => ({ isNotFound: true }),
  stripSearchParams: () => () => ({}),
  useRouter: () => ({ navigate: vi.fn() }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { href: string } }) => unknown
  }) => select({ location: { href: '/u/ada?tab=posts' } }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
  useSuspenseQuery: () => ({ data: mocks.overview }),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isSignedIn: mocks.isSignedIn }),
}))

vi.mock('@/components/app-shell/public-header', () => ({
  PublicHeader: () => <header>public header</header>,
}))

vi.mock('@/components/app-shell/public-footer', () => ({
  PublicFooter: () => <footer>public footer</footer>,
}))

vi.mock('@/features/projects/reactions/project-reaction-bar', () => ({
  ProjectReactionBar: () => null,
}))

vi.mock('@/features/projects/reactions/reaction-bar', () => ({
  ReactionBar: () => null,
}))

vi.mock('@/features/follows/mutations', () => ({
  useFollowUser: () => mocks.followUser,
  useUnfollowUser: () => mocks.unfollowUser,
}))

vi.mock('@/features/inbox/use-open-conversation', () => ({
  useOpenConversation: () => ({
    openConversation: vi.fn(),
    pendingUserId: null,
  }),
}))

function projectPreview(name: string) {
  return {
    projectId: `project_${name}`,
    ownerUserId: 'user_ada',
    fullName: `ada/${name}`,
    owner: 'ada',
    repo: name,
    description: `${name} description`,
    primaryLanguage: 'TypeScript',
    languages: [{ name: 'TypeScript', bytes: 100 }],
    githubStars: 0,
    locaticLikes: 0,
    reactionCounts: {},
    commentsCount: 0,
    postsCount: 0,
    topics: [],
    lastCommitAt: Date.UTC(2026, 8, 1),
    updatedAt: Date.UTC(2026, 8, 1),
    authorName: 'Ada',
    authorHandle: 'ada',
    authorAvatarUrl: null,
    cityLabel: 'Bengaluru, Karnataka, India',
    cityVisibilityState: 'exact_city',
  }
}

function buildOverview(
  overrides: Partial<PublicProfileOverview> = {},
): PublicProfileOverview {
  return {
    userId: 'user_ada',
    githubUsername: 'ada',
    profile: {
      displayName: 'Ada',
      bio: 'maps and compilers',
      avatarUrl: '',
      buildStatus: 'open_to_collab',
      socialLinks: {},
      location: {
        kind: 'city',
        cityId: 'city_blr',
        cityName: 'Bengaluru, Karnataka, India',
        regionLabel: 'Karnataka, India',
      },
      city: 'Bengaluru, Karnataka, India',
    },
    stats: {
      followersCount: 3,
      followingCount: 1,
      projectsCount: 2,
      postsCount: 0,
      contributionsCount: 0,
      commentsCount: 0,
      likedCount: 0,
    },
    privacy: {
      followGraphVisibility: 'public',
      commentHistoryVisibility: 'public',
      likedProjectsVisibility: 'public',
      contributionsVisibility: 'public',
    },
    githubContributions: null,
    pinnedProjects: [projectPreview('pinned-one')],
    recentProjects: [projectPreview('recent-one')],
    recentPosts: [],
    viewerFollowsProfile: true,
    ...overrides,
  } as unknown as PublicProfileOverview
}

async function renderProfilePage(overview: PublicProfileOverview) {
  mocks.overview = overview
  const queryClient = new QueryClient()
  const profileQueryKey = publicProfileOverviewQueryOptions('ada').queryKey
  queryClient.setQueryData(profileQueryKey, overview)
  const { Route } = await import('@/routes/u.$username')
  const PublicProfilePage = Route.options.component as () => ReactNode

  render(
    <QueryClientProvider client={queryClient}>
      <PublicProfilePage />
    </QueryClientProvider>,
  )

  return { profileQueryKey, queryClient }
}

/** The identity header; the network tabs below reuse "following". */
function profileHeader() {
  const header = screen.getByRole('heading', { level: 1 }).closest('header')
  if (!header) throw new Error('profile header not rendered')
  return within(header)
}

function isBefore(first: Element, second: Element) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  )
}

type ToastOptions = { action?: { label: string; onClick: () => void } }

describe('public profile page (C6)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    mocks.isSignedIn = true
  })

  it('renders identity, bio, actions, pins, recent work, graph, languages, then network', async () => {
    await renderProfilePage(buildOverview())

    const name = screen.getByRole('heading', { level: 1, name: 'Ada' })
    const bio = screen.getByText('maps and compilers')
    const follow = profileHeader().getByRole('button', { name: 'following' })
    expect(isBefore(name, bio)).toBe(true)
    expect(isBefore(bio, follow)).toBe(true)

    // Labelled sections in document order (EmptyState titles are headings
    // too, so the outline alone is not the section order).
    const sections = [
      ...document.querySelectorAll('section[aria-labelledby]'),
    ].map(
      (section) =>
        document.getElementById(section.getAttribute('aria-labelledby') ?? '')
          ?.textContent,
    )
    expect(sections).toEqual([
      'pinned',
      'recent work',
      'github contributions',
      'languages',
      'network',
      'all activity',
    ])
    expect(
      isBefore(follow, screen.getByRole('heading', { name: 'pinned' })),
    ).toBe(true)
    expect(screen.getByRole('main')).toBeTruthy()
  })

  it('links an exact city to Explore and shows a region as plain text', async () => {
    await renderProfilePage(buildOverview())
    const cityLink = screen.getByRole('link', {
      name: /Bengaluru, Karnataka, India/,
    })
    expect(cityLink.getAttribute('data-to')).toBe('/c/$slug')
    cleanup()

    await renderProfilePage(
      buildOverview({
        profile: {
          ...buildOverview().profile,
          location: { kind: 'region', regionLabel: 'Karnataka, India' },
          city: 'Karnataka, India',
        },
      }),
    )
    expect(screen.getByText('Karnataka, India')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Karnataka, India/ })).toBeNull()
  })

  it('omits the pinned section when a builder has no pins', async () => {
    await renderProfilePage(buildOverview({ pinnedProjects: [] }))

    expect(screen.queryByRole('heading', { name: 'pinned' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'recent work' })).toBeTruthy()
  })

  it('gives visitors a sign-up CTA that returns them to this page', async () => {
    mocks.isSignedIn = false
    await renderProfilePage(buildOverview({ viewerFollowsProfile: undefined }))

    const signUp = screen.getByRole('link', { name: 'sign up to follow' })
    expect(signUp.getAttribute('data-to')).toBe('/sign-up/$')
    expect(JSON.parse(signUp.getAttribute('data-search') ?? 'null')).toEqual({
      redirect: '/u/ada?tab=posts',
    })
    const header = profileHeader()
    expect(header.queryByRole('button', { name: /^follow/ })).toBeNull()
    expect(header.queryByRole('button', { name: 'message' })).toBeNull()
  })

  it('gives signed-in viewers follow and message instead of the CTA', async () => {
    await renderProfilePage(buildOverview({ viewerFollowsProfile: false }))

    const header = profileHeader()
    const follow = header.getByRole('button', { name: 'follow' })
    expect(follow.getAttribute('aria-pressed')).toBe('false')
    expect(header.getByRole('button', { name: 'message' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'sign up to follow' })).toBeNull()
  })

  it('offers undo after an unfollow and re-follows through the optimistic path', async () => {
    mocks.unfollowUser.mockResolvedValue(null)
    mocks.followUser.mockResolvedValue(null)
    const { profileQueryKey, queryClient } =
      await renderProfilePage(buildOverview())

    fireEvent.click(profileHeader().getByRole('button', { name: 'following' }))

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))
    expect(mocks.unfollowUser).toHaveBeenCalledWith({
      targetUserId: 'user_ada',
    })
    const [message, options] = mocks.toast.mock.calls[0] as [
      string,
      ToastOptions,
    ]
    expect(message).toBe('unfollowed @ada')
    expect(options.action?.label).toBe('undo')
    expect(
      queryClient.getQueryData<PublicProfileOverview>(profileQueryKey)
        ?.viewerFollowsProfile,
    ).toBe(false)

    options.action?.onClick()

    await waitFor(() =>
      expect(mocks.followUser).toHaveBeenCalledWith({
        targetUserId: 'user_ada',
      }),
    )
    await waitFor(() =>
      expect(
        queryClient.getQueryData<PublicProfileOverview>(profileQueryKey)
          ?.viewerFollowsProfile,
      ).toBe(true),
    )
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('gives a profile its own title and canonical URL', async () => {
    const { Route } = await import('@/routes/u.$username')
    const head = Route.options.head as (args: {
      match: { status: string }
      loaderData: PublicProfileOverview
    }) => { meta: Array<Record<string, string>>; links: unknown[] }

    const publicHead = head({
      match: { status: 'success' },
      loaderData: buildOverview(),
    })
    expect(publicHead.meta).toContainEqual({ title: 'Ada (@ada) · Locatic' })
    expect(publicHead.links).toEqual([
      { rel: 'canonical', href: 'https://locatic.dev/u/ada' },
    ])
    expect(publicHead.meta.some((tag) => tag.name === 'robots')).toBe(false)
  })

  it('404s a missing builder and renders the not-found page in the public shell', async () => {
    const { Route } = await import('@/routes/u.$username')
    const { BuilderNotFound } =
      await import('@/features/profile/public-profile-frame')
    const loader = Route.options.loader as (args: unknown) => Promise<unknown>

    await expect(
      loader({
        context: { queryClient: { ensureQueryData: async () => null } },
        deps: { network: 'followers' },
        params: { username: 'nobody' },
      }),
    ).rejects.toEqual({ isNotFound: true })

    render(<BuilderNotFound />)
    const main = screen.getByRole('main')
    expect(
      within(main).getByRole('heading', {
        level: 1,
        name: 'builder not found',
      }),
    ).toBeTruthy()
    expect(screen.getByText('public header')).toBeTruthy()
    expect(
      within(main).getByRole('link', { name: 'explore builders' }),
    ).toBeTruthy()
  })
})
