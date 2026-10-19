// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'
import type { PropsWithChildren, ReactNode } from 'react'
import { ExploreFeed } from '../explore-feed'
import type { BuilderPreview, ExplorePostPreview } from '../../types'
import type { ExploreBrowsePhase, ExploreFeedState } from '../../feed-state'
import type { ProjectCardPreview } from '@/features/contracts'

vi.mock('@/components/ui/project-card', () => ({
  ProjectCard: ({
    actionSlot,
    authorPlacement,
    onToggleSave,
    project,
    reactionSlot,
    savePending,
    saved,
    variant,
  }: {
    actionSlot?: ReactNode
    authorPlacement?: string
    onToggleSave?: () => void
    project: {
      fullName: string
      id?: string
      projectId?: string
      city?: string | null
      cityId?: string | null
    }
    reactionSlot?: ReactNode
    savePending?: boolean
    saved?: boolean
    variant?: string
  }) => (
    <article
      data-testid={`project-${project.id ?? project.projectId}`}
      data-author-placement={authorPlacement}
      data-variant={variant}
      data-city={project.city ?? undefined}
      data-city-id={project.cityId ?? undefined}
    >
      <h3>{project.fullName}</h3>
      {onToggleSave && (
        <button type="button" onClick={onToggleSave} disabled={savePending}>
          {saved ? 'saved' : 'save'}
        </button>
      )}
      {reactionSlot}
      {actionSlot}
    </article>
  ),
}))

const saveMocks = vi.hoisted(() => ({
  savedIds: new Set<string>(),
  toggle: vi.fn(),
  pendingIds: new Set<string>(),
  savedStateEnabled: [] as boolean[],
}))

vi.mock('@/features/projects/saves', () => ({
  useProjectSaveToggle: () => ({
    toggle: saveMocks.toggle,
    isPending: (projectId: string) => saveMocks.pendingIds.has(projectId),
  }),
}))

vi.mock('../../use-explore-saves', () => ({
  useExploreSavedProjectIds: (_ids: string[], enabled: boolean) => {
    saveMocks.savedStateEnabled.push(enabled)
    return enabled ? saveMocks.savedIds : new Set<string>()
  },
}))

vi.mock('@/features/projects/reactions/project-reaction-bar', () => ({
  ProjectReactionBar: () => null,
}))

vi.mock('@/features/projects/reactions/reaction-bar', () => ({
  ReactionBar: ({
    reactionCounts,
    viewerReactionTypes,
  }: {
    reactionCounts: Record<string, number>
    viewerReactionTypes?: string[]
  }) => (
    <button type="button" aria-label="Toggle explore reaction">
      {Object.entries(reactionCounts)
        .map(([type, count]) => `${type}:${count}`)
        .join(',')}{' '}
      active:{viewerReactionTypes?.join(',') ?? ''}
    </button>
  ),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) => (
    <a
      href={typeof to === 'string' ? to : '#'}
      data-search={search ? JSON.stringify(search) : undefined}
      {...props}
    >
      {children}
    </a>
  ),
}))

vi.mock('motion/react-m', () => ({
  div: ({
    children,
    variants,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) => (
    <div data-motion-row={variants ? 'true' : undefined} {...props}>
      {children}
    </div>
  ),
  button: ({
    children,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
}))

const project = {
  projectId: 'project_1' as Id<'projects'>,
  ownerUserId: 'user_1' as Id<'users'>,
  fullName: 'locatic/app',
  owner: 'locatic',
  repo: 'app',
  description: 'Developer activity platform',
  primaryLanguage: 'TypeScript',
  languages: [],
  githubStars: 10,
  locaticLikes: 2,
  commentsCount: 1,
  postsCount: 3,
  topics: ['react'],
  lastCommitAt: Date.now(),
  updatedAt: Date.now(),
  authorName: 'Avi',
  authorHandle: 'avinash',
  authorAvatarUrl: null,
  cityLabel: 'Bengaluru, Karnataka, India',
  cityVisibilityState: 'unset',
} satisfies ProjectCardPreview

const builder = {
  userId: 'user_2' as Id<'users'>,
  displayName: 'Mira Builder',
  avatarUrl: null,
  githubUsername: 'mira',
  buildStatus: 'building_solo',
  location: {
    kind: 'city',
    cityId: 'city_1' as Id<'cities'>,
    cityName: 'Bengaluru, Karnataka, India',
    citySlug: 'bengaluru-in',
    regionLabel: 'Karnataka, India',
  },
  projectsCount: 4,
  followersCount: 12,
  isNewBuilder: false,
} satisfies BuilderPreview

const post = {
  _id: 'post_1' as Id<'posts'>,
  _creationTime: Date.now(),
  projectId: 'project_1' as Id<'projects'>,
  ownerId: 'user_1' as Id<'users'>,
  actorId: 'user_1' as Id<'users'>,
  authorRole: 'owner',
  body: 'Shipping map-based discovery for builders.',
  searchText:
    'shipping map-based discovery for builders locatic/app react #react maps #maps',
  reactionCounts: {},
  viewerHasLiked: false,
  viewerReactionTypes: [],
  commentsCount: 0,
  projectCityId: 'city_1' as Id<'cities'>,
  projectTopics: ['react', 'maps'],
  actorSnapshot: {
    displayName: 'Avi',
    avatarUrl: '',
    cityId: null,
    cityName: null,
  },
  projectSnapshot: {
    name: 'app',
    fullName: 'locatic/app',
    ownerLogin: 'locatic',
    primaryLanguage: 'TypeScript',
    languages: [],
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  deletedAt: null,
} satisfies ExplorePostPreview

const projectsBrowse = (
  phase: ExploreBrowsePhase<ProjectCardPreview>,
  scope: 'global' | 'cities' = 'cities',
): ExploreFeedState => ({
  mode: 'projects',
  source: 'browse',
  scope,
  ...phase,
})

function renderFeed(
  state: ExploreFeedState,
  overrides: Partial<Parameters<typeof ExploreFeed>[0]> = {},
) {
  const props = {
    entranceKey: 'projects\u001fglobal\u001f\u001f',
    followOverrides: {},
    followedUserIds: new Set<string>(),
    likedProjectIds: new Set<string>(),
    onClearCityFilters: vi.fn(),
    onDismissPost: vi.fn(),
    onDismissProject: vi.fn(),
    onFollowUser: vi.fn(),
    onLoadMore: vi.fn(),
    onMessageUser: vi.fn(),
    onResetExplore: vi.fn(),
    pendingFollows: new Set<string>(),
    pendingUserId: null,
    state,
    ...overrides,
  } satisfies Parameters<typeof ExploreFeed>[0]

  return { props, ...render(<ExploreFeed {...props} />) }
}

describe('ExploreFeed', () => {
  it('keeps appended project rows static after dismissing a first-page row', () => {
    const paginatedItems = Array.from({ length: 21 }, (_, index) => ({
      ...project,
      projectId: `project_${index + 1}` as Id<'projects'>,
      fullName: `locatic/app-${index + 1}`,
    }))
    const [, ...afterDismiss] = paginatedItems
    const { props, rerender } = renderFeed(
      projectsBrowse({
        status: 'ready',
        items: paginatedItems as [typeof project],
        more: 'available',
      }),
    )

    const appendedRow = screen.getByTestId('project-project_21').parentElement
    expect(appendedRow).not.toBeNull()
    expect(appendedRow?.getAttribute('data-motion-row')).toBeNull()

    rerender(
      <ExploreFeed
        {...props}
        state={projectsBrowse({
          status: 'ready',
          items: afterDismiss as [typeof project],
          more: 'available',
        })}
      />,
    )

    expect(
      screen
        .getByTestId('project-project_21')
        .parentElement?.getAttribute('data-motion-row'),
    ).toBeNull()
  })

  it('keeps post-search pagination static but animates a fresh result set', () => {
    const postsSearch = (ids: string[], body: string) =>
      ({
        mode: 'posts',
        source: 'search',
        query: 'react',
        status: 'ready',
        more: 'available',
        items: ids.map((id, index) => ({
          ...post,
          _id: id as Id<'posts'>,
          body: `${body} ${index + 1}`,
        })) as [typeof post],
      }) satisfies ExploreFeedState
    const ids = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`)
    const { props, rerender } = renderFeed(
      postsSearch(ids('post_', 10), 'Post'),
    )

    const getPostRow = (body: string) =>
      screen.getByText(body).closest('.lx-card')?.parentElement

    expect(getPostRow('Post 1')?.getAttribute('data-motion-row')).toBe('true')

    rerender(
      <ExploreFeed {...props} state={postsSearch(ids('post_', 30), 'Post')} />,
    )

    expect(getPostRow('Post 11')?.getAttribute('data-motion-row')).toBeNull()

    rerender(
      <ExploreFeed
        {...props}
        entranceKey='["posts","global",[],"new query"]'
        state={postsSearch(ids('new_post_', 10), 'Fresh post')}
      />,
    )

    expect(getPostRow('Fresh post 1')?.getAttribute('data-motion-row')).toBe(
      'true',
    )
  })

  it('renders frameless project rows with the header author placement', () => {
    renderFeed(
      projectsBrowse({ status: 'ready', items: [project], more: 'none' }),
    )

    expect(screen.getByText('locatic/app')).toBeTruthy()
    expect(screen.getByText('projects')).toBeTruthy()
    expect(
      screen
        .getByTestId('project-project_1')
        .getAttribute('data-author-placement'),
    ).toBe('header')
    expect(
      screen.getByTestId('project-project_1').getAttribute('data-variant'),
    ).toBe('row')
  })

  it('passes the exact-city owner city id to the card so its pill links', () => {
    const exactCity = {
      ...project,
      cityVisibilityState: 'exact_city',
      ownerLocation: {
        kind: 'city',
        cityId: 'city_1' as Id<'cities'>,
        cityName: 'Bengaluru, Karnataka, India',
        citySlug: 'bengaluru-in',
        regionLabel: 'Karnataka, India',
      },
    } satisfies ProjectCardPreview
    const regionOnly = {
      ...project,
      projectId: 'project_2' as Id<'projects'>,
      fullName: 'locatic/region',
      repo: 'region',
      cityLabel: 'Karnataka, India',
      cityVisibilityState: 'region_only',
      ownerLocation: { kind: 'region', regionLabel: 'Karnataka, India' },
    } satisfies ProjectCardPreview

    renderFeed(
      projectsBrowse({
        status: 'ready',
        items: [exactCity, regionOnly],
        more: 'none',
      }),
    )

    const exactCard = screen.getByTestId('project-project_1')
    const regionCard = screen.getByTestId('project-project_2')
    expect(exactCard.getAttribute('data-city')).toBe(
      'Bengaluru, Karnataka, India',
    )
    expect(exactCard.getAttribute('data-city-id')).toBe('city_1')
    expect(regionCard.getAttribute('data-city')).toBe('Karnataka, India')
    expect(regionCard.getAttribute('data-city-id')).toBeNull()
  })

  it('labels project search results as matching projects', () => {
    renderFeed({
      mode: 'projects',
      source: 'search',
      query: 'app',
      status: 'ready',
      items: [project],
      more: 'none',
    })

    expect(screen.getByText('matching projects')).toBeTruthy()
  })

  it('renders builder rows with their disclosed location', () => {
    const regionBuilder: BuilderPreview = {
      ...builder,
      userId: 'user_3' as Id<'users'>,
      displayName: 'Rae Region',
      githubUsername: 'rae',
      location: { kind: 'region', regionLabel: 'Karnataka, India' },
    }
    const hiddenBuilder: BuilderPreview = {
      ...builder,
      userId: 'user_4' as Id<'users'>,
      displayName: 'Hal Hidden',
      githubUsername: 'hal',
      location: { kind: 'none' },
    }

    renderFeed({
      mode: 'builders',
      source: 'browse',
      scope: 'cities',
      status: 'ready',
      items: [builder, regionBuilder, hiddenBuilder],
      more: 'none',
    })

    expect(screen.getByText('Mira Builder')).toBeTruthy()
    // Exact city: a pill linking to that city's Explore (C4).
    expect(
      screen.getByRole('link', { name: 'Bengaluru, Karnataka, India' }),
    ).toBeTruthy()
    // Region only: plain text, not a link.
    expect(screen.getByText('Karnataka, India').closest('a')).toBeNull()
    // Hidden: no location at all.
    const halRow = screen.getByText('@hal').closest('.bg-surface')
    expect(halRow?.textContent).not.toContain('India')
  })

  it('turns personal actions into sign-in links for visitors', () => {
    const visitor = { signInRedirect: '/explore?mode=builders' }
    const { unmount } = renderFeed(
      {
        mode: 'builders',
        source: 'browse',
        scope: 'global',
        status: 'ready',
        items: [builder],
        more: 'none',
      },
      { visitor },
    )

    const follow = screen.getByRole('link', {
      name: 'Sign in to follow Mira Builder',
    })
    expect(follow.getAttribute('href')).toBe('/sign-in/$')
    expect(JSON.parse(follow.getAttribute('data-search') ?? '{}')).toEqual({
      redirect: '/explore?mode=builders',
    })
    expect(screen.queryByRole('button', { name: 'follow' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Message/ })).toBeNull()
    unmount()

    renderFeed(
      {
        mode: 'posts',
        source: 'browse',
        scope: 'global',
        status: 'ready',
        items: [post],
        more: 'none',
      },
      { visitor },
    )
    expect(
      screen.getByRole('link', { name: 'Sign in to react to this post' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dismiss post' })).toBeNull()
  })

  it('renders post rows with tags', () => {
    renderFeed({
      mode: 'posts',
      source: 'browse',
      scope: 'global',
      status: 'ready',
      items: [post],
      more: 'none',
    })

    expect(screen.getByText(/Shipping map-based discovery/)).toBeTruthy()
    expect(screen.getByText('#react')).toBeTruthy()
    expect(screen.queryByText('search posts by body or topic.')).toBeNull()
    expect(screen.getByText('posts')).toBeTruthy()
  })

  it('gives explore posts an author identity (pfp + name) like project cards', () => {
    renderFeed({
      mode: 'posts',
      source: 'browse',
      scope: 'global',
      status: 'ready',
      items: [post],
      more: 'none',
    })

    // Author name leads the header, and the avatar (initials fallback, empty
    // avatarUrl) is labelled with the author name.
    expect(screen.getByText('Avi')).toBeTruthy()
    expect(screen.getByLabelText('Avi')).toBeTruthy()
  })

  it('renders interactive reaction state without dismissing the post', () => {
    const reactedPost = {
      ...post,
      reactionCounts: { like: 3, rocket: 1 },
      viewerHasLiked: true,
      viewerReactionTypes: ['like'],
    }
    const { props } = renderFeed({
      mode: 'posts',
      source: 'browse',
      scope: 'global',
      status: 'ready',
      items: [reactedPost],
      more: 'none',
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle explore reaction' }),
    )

    expect(screen.getByText(/like:3,rocket:1/)).toBeTruthy()
    expect(screen.getByText(/active:like/)).toBeTruthy()
    expect(props.onDismissPost).not.toHaveBeenCalled()
  })

  it('renders cached post payloads that predate viewer reaction state', () => {
    const cachedPost: ExplorePostPreview = { ...post }
    delete cachedPost.viewerHasLiked
    delete cachedPost.viewerReactionTypes

    renderFeed({
      mode: 'posts',
      source: 'browse',
      scope: 'global',
      status: 'ready',
      items: [cachedPost],
      more: 'none',
    })

    expect(screen.getByText(/Shipping map-based discovery/)).toBeTruthy()
    expect(screen.getByText(/active:/)).toBeTruthy()
  })

  it('shows scoped post browse empty copy once the feed is exhausted', () => {
    renderFeed({
      mode: 'posts',
      source: 'browse',
      scope: 'cities',
      status: 'exhausted',
    })

    expect(
      screen.getByText('no posts found for this city context.'),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'clear city filters' }),
    ).toBeTruthy()
  })

  it('shows global post browse empty copy when browsing everywhere', () => {
    renderFeed({
      mode: 'posts',
      source: 'browse',
      scope: 'global',
      status: 'exhausted',
    })

    expect(screen.getByText('no posts to explore right now.')).toBeTruthy()
  })

  it('shows post browse loading instead of empty copy', () => {
    renderFeed({
      mode: 'posts',
      source: 'browse',
      scope: 'cities',
      status: 'loading',
    })

    expect(screen.getByRole('status', { name: 'loading posts…' })).toBeTruthy()
    expect(
      screen.queryByText('no posts found for this city context.'),
    ).toBeNull()
  })

  it('renders post search results as project links', () => {
    renderFeed({
      mode: 'posts',
      source: 'search',
      query: 'maps',
      status: 'ready',
      items: [post],
      more: 'none',
    })

    expect(screen.getByRole('link', { name: /locatic\/app/i })).toBeTruthy()
    expect(screen.getByText('matching posts')).toBeTruthy()
  })

  it('shows post search loading before no-results copy', () => {
    renderFeed({
      mode: 'posts',
      source: 'search',
      query: 'react',
      status: 'loading',
    })

    expect(
      screen.getByRole('status', { name: 'searching posts…' }),
    ).toBeTruthy()
    expect(screen.queryByText(/no posts found/)).toBeNull()
  })

  it('shows search no-results copy with the query once a search is exhausted', () => {
    renderFeed({
      mode: 'builders',
      source: 'search',
      query: 'zed',
      status: 'exhausted',
    })

    expect(screen.getByText('no builders found for “zed”.')).toBeTruthy()
  })

  it('shows a failed search as an error, not as no results', () => {
    renderFeed({
      mode: 'projects',
      source: 'search',
      query: 'app',
      status: 'error',
    })

    expect(screen.getByText("couldn't load projects.")).toBeTruthy()
    expect(screen.queryByText('no projects found.')).toBeNull()
  })

  it('suppresses project empty copy while the feed is loading', () => {
    for (const scope of ['cities', 'global'] as const) {
      const { unmount } = renderFeed(
        projectsBrowse({ status: 'loading' }, scope),
      )

      expect(
        screen.getByRole('status', { name: 'loading projects…' }),
      ).toBeTruthy()
      expect(
        screen.queryByText('no projects match these cities yet.'),
      ).toBeNull()
      expect(screen.queryByText('nothing to explore right now.')).toBeNull()
      unmount()
    }
  })

  it('builds the project loading skeleton inside the ready list wrapper', () => {
    const { unmount } = renderFeed(
      projectsBrowse({ status: 'ready', items: [project], more: 'none' }),
    )
    // Card -> motion row -> list wrapper.
    const readyList = screen.getByTestId('project-project_1').parentElement
      ?.parentElement as HTMLElement
    const readyListClass = readyList.className
    const readyOuterClass = readyList.parentElement?.className
    unmount()

    renderFeed(projectsBrowse({ status: 'loading' }))

    const skeletons = screen.getAllByTestId('project-card-skeleton')
    expect(skeletons).toHaveLength(3)
    const skeletonList = skeletons[0].parentElement as HTMLElement
    expect(skeletons.every((row) => row.parentElement === skeletonList)).toBe(
      true,
    )
    expect(skeletonList.className).toBe(readyListClass)
    expect(skeletonList.parentElement?.className).toBe(readyOuterClass)
  })

  it('keeps a filtered-empty page with more results out of the empty state', () => {
    renderFeed(projectsBrowse({ status: 'emptyPageWithMore', items: [] }))

    expect(
      screen.getByRole('status', { name: 'loading projects…' }),
    ).toBeTruthy()
    expect(screen.queryByText('no projects match these cities yet.')).toBeNull()
  })

  it('keeps loaded rows while fetching past a filtered-empty page', () => {
    renderFeed(
      projectsBrowse({ status: 'emptyPageWithMore', items: [project] }),
    )

    expect(screen.getByText('locatic/app')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'loading…' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('offers keep looking once automatic fetching stops, with or without rows', () => {
    const { props, unmount } = renderFeed(
      projectsBrowse({ status: 'needsContinuation', items: [] }),
    )

    expect(screen.queryByText('no projects match these cities yet.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'keep looking' }))
    expect(props.onLoadMore).toHaveBeenCalledTimes(1)
    unmount()

    renderFeed(
      projectsBrowse({ status: 'needsContinuation', items: [project] }),
    )
    expect(screen.getByText('locatic/app')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'keep looking' })).toBeTruthy()
  })

  it('shows the city empty state with its actions only when exhausted', () => {
    const { props } = renderFeed(projectsBrowse({ status: 'exhausted' }))

    expect(screen.getByText('no projects match these cities yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'clear city filters' }))
    expect(props.onClearCityFilters).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'keep looking' })).toBeNull()
  })

  it('names an empty selected city, counts its builders and offers both actions', () => {
    const emptyCity = {
      cityName: 'Mysuru',
      builderCount: 1,
      localBuilders: [builder],
      onBrowseEverywhere: vi.fn(),
      onChooseAnotherCity: vi.fn(),
    }
    const { props } = renderFeed(projectsBrowse({ status: 'exhausted' }), {
      emptyCity,
    })

    expect(
      screen.getByRole('heading', { name: 'no projects in Mysuru yet.' }),
    ).toBeTruthy()
    expect(screen.getByText('1 builder here')).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'builders in Mysuru' }),
    ).toBeTruthy()
    expect(screen.getByText('Mira Builder')).toBeTruthy()
    // Rendering changes nothing; only a click does.
    expect(emptyCity.onBrowseEverywhere).not.toHaveBeenCalled()
    expect(props.onClearCityFilters).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'browse everywhere' }))
    expect(emptyCity.onBrowseEverywhere).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'choose another city' }))
    expect(emptyCity.onChooseAnotherCity).toHaveBeenCalledTimes(1)
  })

  it('keeps the empty city copy until the builder count loads, and pluralises it', () => {
    const emptyCity = {
      cityName: 'Mysuru',
      builderCount: null,
      localBuilders: [],
      onBrowseEverywhere: vi.fn(),
      onChooseAnotherCity: vi.fn(),
    }
    const { props, rerender } = renderFeed(
      projectsBrowse({ status: 'exhausted' }),
      { emptyCity },
    )
    expect(screen.queryByText(/builders? here/)).toBeNull()
    expect(screen.queryByRole('heading', { name: /builders in/ })).toBeNull()

    rerender(
      <ExploreFeed {...props} emptyCity={{ ...emptyCity, builderCount: 0 }} />,
    )
    expect(screen.getByText('0 builders here')).toBeTruthy()
  })

  it('marks the viewer own projects as yours after the other projects', () => {
    const mine = {
      ...project,
      projectId: 'project_mine' as Id<'projects'>,
      fullName: 'me/mine',
      isViewerProject: true,
    }
    renderFeed(
      projectsBrowse({
        status: 'ready',
        items: [project, mine],
        more: 'none',
      }),
    )

    const cards = screen.getAllByRole('article')
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual([
      'locatic/app',
      'me/mine',
    ])
    // Own projects are not saved, followed or dismissed from Explore.
    expect(cards[1]?.querySelector('button')).toBeNull()
    const yours = screen.getAllByText('yours')
    expect(yours).toHaveLength(1)
    expect(yours[0]?.parentElement?.textContent).toContain('me/mine')
  })

  it('dismisses post search rows independently from the project link', () => {
    const { props } = renderFeed({
      mode: 'posts',
      source: 'search',
      query: 'maps',
      status: 'ready',
      items: [post],
      more: 'none',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss post' }))

    expect(props.onDismissPost).toHaveBeenCalledWith('post_1', 'post_1')
  })

  it('renders a post load-more action when more post results can be requested', () => {
    const { props } = renderFeed({
      mode: 'posts',
      source: 'search',
      query: 'maps',
      status: 'ready',
      items: [post],
      more: 'available',
    })

    fireEvent.click(screen.getByRole('button', { name: 'load more posts' }))

    expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('keeps post results visible while a load-more request is pending', () => {
    renderFeed({
      mode: 'posts',
      source: 'search',
      query: 'maps',
      status: 'ready',
      items: [post],
      more: 'loading',
    })

    expect(screen.getByText(/Shipping map-based discovery/)).toBeTruthy()
    expect(screen.queryByText('searching posts…')).toBeNull()
    expect(screen.getByRole('button', { name: 'loading…' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('renders a project load-more action for bounded explore expansion', () => {
    const { props } = renderFeed(
      projectsBrowse({ status: 'ready', items: [project], more: 'available' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'load more projects' }))

    expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  })

  describe('filters and order (D2, D3)', () => {
    const activeFilters = {
      description: 'primary language rust, topic #webgpu',
      onClear: vi.fn(),
    }

    it('keeps looking under filters, never claiming no results', () => {
      const { props } = renderFeed(
        projectsBrowse({ status: 'needsContinuation', items: [] }),
        { activeFilters },
      )

      expect(
        screen.getByText(
          'no projects with primary language rust, topic #webgpu in the latest results yet.',
        ),
      ).toBeTruthy()
      expect(screen.queryByText('no projects match these filters.')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'keep looking' }))
      expect(props.onLoadMore).toHaveBeenCalledTimes(1)
    })

    it('shows the filtered empty state only once exhausted, before the city one', () => {
      const onClear = vi.fn()
      renderFeed(projectsBrowse({ status: 'exhausted' }), {
        activeFilters: { ...activeFilters, onClear },
        emptyCity: {
          cityName: 'Mysuru',
          builderCount: 3,
          localBuilders: [],
          onBrowseEverywhere: vi.fn(),
          onChooseAnotherCity: vi.fn(),
        },
      })

      // The city may have projects; the filters are why none show.
      expect(
        screen.getByRole('heading', {
          name: 'no projects match these filters.',
        }),
      ).toBeTruthy()
      expect(screen.queryByText('no projects in Mysuru yet.')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'clear filters' }))
      expect(onClear).toHaveBeenCalledTimes(1)
    })

    it('states the feed order beside the browse heading', () => {
      renderFeed(
        projectsBrowse({ status: 'ready', items: [project], more: 'none' }),
        {
          orderingCopy:
            'most recent public work first; projects matching your stack first',
        },
      )

      expect(
        screen.getByText(
          '· most recent public work first; projects matching your stack first',
          { exact: false },
        ),
      ).toBeTruthy()
    })

    it('shows the collaboration status on builder rows that invite collaboration', () => {
      const statuses = [
        'open_to_collab',
        'looking_for_cofounder',
        'hiring',
        'building_solo',
      ] as const
      const [firstRow, ...otherRows] = statuses.map((buildStatus, index) => ({
        ...builder,
        userId: `user_${index + 10}` as Id<'users'>,
        displayName: `Builder ${buildStatus}`,
        githubUsername: buildStatus,
        buildStatus,
      }))

      renderFeed({
        mode: 'builders',
        source: 'browse',
        scope: 'cities',
        status: 'ready',
        items: [firstRow!, ...otherRows],
        more: 'none',
      })

      expect(screen.getByText('open to collab')).toBeTruthy()
      expect(screen.queryByText(/new builder/)).toBeNull()
      expect(screen.getByText('looking for cofounder')).toBeTruthy()
      expect(screen.getByText('hiring / building a team')).toBeTruthy()
      expect(screen.queryByText('building solo')).toBeNull()
      // The profile link keeps its name; the status is its description.
      const describedBy = (name: string) =>
        screen.getByRole('link', { name }).getAttribute('aria-describedby')
      const hiringStatusId = describedBy("Open Builder hiring's profile")
      expect(hiringStatusId).toBeTruthy()
      expect(document.getElementById(hiringStatusId!)?.textContent).toBe(
        'hiring / building a team',
      )
      expect(describedBy("Open Builder building_solo's profile")).toBeNull()
    })
  })

  describe('saves on project cards (D1)', () => {
    it('passes saved state and the toggle to signed-in cards', () => {
      saveMocks.savedIds = new Set(['project_1'])
      saveMocks.pendingIds = new Set()
      saveMocks.toggle.mockClear()
      const other = {
        ...project,
        projectId: 'project_2' as Id<'projects'>,
        fullName: 'locatic/cli',
      }

      renderFeed(
        projectsBrowse({
          status: 'ready',
          items: [project, other],
          more: 'none',
        }),
      )

      const first = screen.getByTestId('project-project_1')
      const second = screen.getByTestId('project-project_2')
      expect(first.querySelector('button')?.textContent).toBe('saved')
      expect(second.querySelector('button')?.textContent).toBe('save')

      fireEvent.click(first.querySelector('button')!)
      expect(saveMocks.toggle).toHaveBeenCalledWith({
        projectId: 'project_1',
        projectName: 'locatic/app',
        saved: true,
      })
      fireEvent.click(second.querySelector('button')!)
      expect(saveMocks.toggle).toHaveBeenLastCalledWith({
        projectId: 'project_2',
        projectName: 'locatic/cli',
        saved: false,
      })
    })

    it('disables the toggle while a save is in flight', () => {
      saveMocks.pendingIds = new Set(['project_1'])

      renderFeed(
        projectsBrowse({ status: 'ready', items: [project], more: 'none' }),
      )

      expect(
        screen.getByTestId('project-project_1').querySelector('button'),
      ).toHaveProperty('disabled', true)
      saveMocks.pendingIds = new Set()
    })

    it('gives visitors a sign-in link instead of a save toggle', () => {
      saveMocks.savedStateEnabled = []

      renderFeed(
        projectsBrowse({ status: 'ready', items: [project], more: 'none' }),
        { visitor: { signInRedirect: '/explore' } },
      )

      expect(
        screen.getByRole('link', {
          name: 'Sign in to react, follow or save locatic/app',
        }).textContent,
      ).toBe('sign in to react, follow or save')
      expect(screen.queryByRole('button', { name: /^save/ })).toBeNull()
      // The saved-state query never runs for a visitor.
      expect(saveMocks.savedStateEnabled.every((enabled) => !enabled)).toBe(
        true,
      )
    })
  })

  it('labels a new account as a new builder', () => {
    renderFeed({
      mode: 'builders',
      source: 'browse',
      scope: 'cities',
      status: 'ready',
      items: [{ ...builder, isNewBuilder: true }],
      more: 'none',
    })

    expect(screen.getByText('@mira · new builder')).toBeTruthy()
  })
})
