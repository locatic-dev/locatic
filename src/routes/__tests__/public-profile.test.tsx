// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  publicFollowGraphQueryOptions,
  publicProfileOverviewQueryOptions,
} from '@/features/profile/queries'
import { emptySocialPage } from '@/features/profile/state'
import type { PublicProfileOverview } from '@/features/profile/types'

const mocks = vi.hoisted(() => {
  const toastError = vi.fn()
  return {
    followUser: vi.fn(),
    isSignedIn: true,
    overview: null as unknown,
    realGraphQuery: false,
    network: 'followers' as 'followers' | 'following',
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
      useSearch: () => ({ tab: 'projects', network: mocks.network }),
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

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...original,
    useQuery: (options: Parameters<typeof original.useQuery>[0]) =>
      mocks.realGraphQuery &&
      JSON.stringify(options.queryKey).includes('publicFollowGraphPage')
        ? original.useQuery(options)
        : { data: undefined, isLoading: false },
    useSuspenseQuery: () => ({ data: mocks.overview }),
  }
})

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

async function renderProfilePage(
  overview: PublicProfileOverview,
  queryClient = new QueryClient(),
) {
  mocks.overview = overview
  const profileQueryKey = publicProfileOverviewQueryOptions('ada').queryKey
  queryClient.setQueryData(profileQueryKey, overview)
  const { Route } = await import('@/routes/u.$username')
  const PublicProfilePage = Route.options.component as () => ReactNode

  const page = () => (
    <QueryClientProvider client={queryClient}>
      <PublicProfilePage />
    </QueryClientProvider>
  )
  const view = render(page())

  return { profileQueryKey, queryClient, page, ...view }
}

function networkPage(name: string, done = true) {
  return {
    ...emptySocialPage(),
    isDone: done,
    continueCursor: 'next-page',
    page: [
      {
        userId: name,
        displayName: name,
        githubUsername: name.toLowerCase(),
        avatarUrl: null,
        cityName: null,
      },
    ],
  }
}

function firstGraphKey(kind: 'followers' | 'following') {
  return publicFollowGraphQueryOptions({
    username: 'ada',
    kind,
    paginationOpts: { cursor: null, numItems: 12 },
  }).queryKey
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
    mocks.realGraphQuery = false
    mocks.network = 'followers'
  })

  it('waits for the initial network snapshot before the loader completes', async () => {
    const { Route } = await import('@/routes/u.$username')
    let finishGraph!: () => void
    const graph = new Promise<void>((resolve) => {
      finishGraph = resolve
    })
    const prefetchQuery = vi.fn(() => graph)
    let completed = false
    const loader = Route.options.loader as (args: unknown) => Promise<unknown>
    const loading = loader({
      context: {
        queryClient: {
          ensureQueryData: async () => buildOverview(),
          prefetchQuery,
        },
      },
      deps: { network: 'followers' },
      params: { username: 'ada' },
    }).then(() => {
      completed = true
    })
    await vi.waitFor(() => expect(prefetchQuery).toHaveBeenCalledOnce())
    expect(completed).toBe(false)
    finishGraph()
    await loading
    expect(completed).toBe(true)
  })

  it('server-renders cached network rows and hydrates them without an empty flash', async () => {
    mocks.realGraphQuery = true
    mocks.isSignedIn = false
    mocks.overview = buildOverview()
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { queryFn: async () => [], staleTime: Infinity, retry: false },
      },
    })
    queryClient.setQueryData(
      publicFollowGraphQueryOptions({
        username: 'ada',
        kind: 'followers',
        paginationOpts: { cursor: null, numItems: 12 },
      }).queryKey,
      {
        ...emptySocialPage(),
        page: [
          {
            userId: 'grace',
            displayName: 'Grace Hopper',
            githubUsername: 'grace',
            avatarUrl: null,
            cityName: null,
          },
        ],
      },
    )
    const { Route } = await import('@/routes/u.$username')
    const Page = Route.options.component as () => ReactNode
    const page = (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    )
    const html = renderToString(page)
    expect(html).toContain('Grace Hopper')
    expect(html).not.toContain('no followers yet.')
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const recoverable = vi.fn()
    const root = hydrateRoot(container, page, {
      onRecoverableError: recoverable,
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(
      within(container).getByRole('button', {
        name: "Open Grace Hopper's profile",
      }),
    ).toBeTruthy()
    expect(recoverable).not.toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()
    queryClient.clear()
  })

  it('keeps appended pages across tabs and discards them after the first snapshot changes', async () => {
    mocks.realGraphQuery = true
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          queryFn: async () => networkPage('Katherine'),
          staleTime: Infinity,
          retry: false,
        },
      },
    })
    queryClient.setQueryData(
      firstGraphKey('followers'),
      networkPage('Grace', false),
    )
    queryClient.setQueryData(
      firstGraphKey('following'),
      networkPage('Margaret'),
    )
    const { page, rerender } = await renderProfilePage(
      buildOverview(),
      queryClient,
    )
    fireEvent.click(screen.getByRole('button', { name: 'load more' }))
    await screen.findByRole('button', { name: "Open Katherine's profile" })
    mocks.network = 'following'
    rerender(page())
    expect(
      screen.getByRole('button', { name: "Open Margaret's profile" }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: "Open Katherine's profile" }),
    ).toBeNull()
    mocks.network = 'followers'
    rerender(page())
    expect(
      screen.getByRole('button', { name: "Open Katherine's profile" }),
    ).toBeTruthy()

    await act(async () => {
      queryClient.setQueryData(
        firstGraphKey('followers'),
        networkPage('Dorothy'),
      )
    })
    expect(
      await screen.findByRole('button', { name: "Open Dorothy's profile" }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: "Open Katherine's profile" }),
    ).toBeNull()
    queryClient.clear()
  })

  it('does not append a late page to a refreshed cursor chain', async () => {
    mocks.realGraphQuery = true
    let finish!: (value: ReturnType<typeof networkPage>) => void
    const pending = new Promise<ReturnType<typeof networkPage>>((resolve) => {
      finish = resolve
    })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { queryFn: () => pending, staleTime: Infinity, retry: false },
      },
    })
    queryClient.setQueryData(
      firstGraphKey('followers'),
      networkPage('Grace', false),
    )
    queryClient.setQueryData(
      firstGraphKey('following'),
      networkPage('Margaret'),
    )
    await renderProfilePage(buildOverview(), queryClient)
    fireEvent.click(screen.getByRole('button', { name: 'load more' }))
    await act(async () => {
      queryClient.setQueryData(
        firstGraphKey('followers'),
        networkPage('Dorothy'),
      )
    })
    await act(async () => {
      finish(networkPage('Stale'))
      await pending
    })
    expect(
      screen.getByRole('button', { name: "Open Dorothy's profile" }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: "Open Stale's profile" }),
    ).toBeNull()
    queryClient.clear()
  })

  it('shows a retry after a network failure instead of claiming there are no followers', async () => {
    mocks.realGraphQuery = true
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          queryFn: async () => {
            throw new Error('offline')
          },
          retry: false,
        },
      },
    })
    await renderProfilePage(buildOverview(), queryClient)
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining("couldn't load this network."),
    )
    expect(screen.queryByText('no followers yet.')).toBeNull()
    expect(screen.getByRole('button', { name: 'try again' })).toBeTruthy()
    queryClient.clear()
  })

  it('hides the calendar section when contributions are private, even with cached calendar data', async () => {
    const overview = buildOverview()
    await renderProfilePage({
      ...overview,
      privacy: { ...overview.privacy, contributionsVisibility: 'private' },
      githubContributions: {
        totalContributions: 1234,
        syncedAt: 0,
        weeks: [{ days: [{ count: 3, date: '2026-06-01' }] }],
      },
    })

    expect(
      screen.queryByRole('heading', { name: 'github contributions' }),
    ).toBeNull()
    expect(screen.queryByText('1,234 contributions this year')).toBeNull()
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
