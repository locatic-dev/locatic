// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'
import type { PropsWithChildren } from 'react'
import { ExploreFeed } from '../explore-feed'
import type { BuilderPreview, ExplorePostPreview } from '../../types'
import type { ProjectCardPreview } from '@/features/contracts'

vi.mock('@/components/ui/project-card', () => ({
  ProjectCard: ({
    authorPlacement,
    project,
    showFullCity,
  }: {
    authorPlacement?: string
    project: { fullName: string; projectId: string }
    showFullCity?: boolean
  }) => (
    <article
      data-testid={`project-${project.projectId}`}
      data-author-placement={authorPlacement}
      data-show-full-city={showFullCity ? 'true' : 'false'}
    >
      {project.fullName}
    </article>
  ),
  ProjectCardSkeleton: () => <div data-testid="project-card-skeleton" />,
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
    ...props
  }: PropsWithChildren<Record<string, unknown>>) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/project-card-preview', () => ({
  toProjectCardData: (project: ProjectCardPreview) => project,
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
  cityId: 'city_1' as Id<'cities'>,
  cityName: 'Bengaluru, Karnataka, India',
  projectsCount: 4,
  followersCount: 12,
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

function renderFeed(
  overrides: Partial<Parameters<typeof ExploreFeed>[0]> = {},
) {
  const props = {
    builderResults: [],
    builderSearchLoading: false,
    canLoadMoreBuilders: false,
    debouncedSearchQuery: '',
    dismissedIds: new Set<string>(),
    dismissedPostIds: new Set<string>(),
    entranceKey: 'projects\u001fglobal\u001f\u001f',
    followOverrides: {},
    followedUserIds: new Set<string>(),
    hasMorePosts: false,
    hasMoreProjects: false,
    isBuilderSearchActive: false,
    isBuildersMode: false,
    isGlobalFeed: false,
    isLoadingMoreBuilders: false,
    isPostSearchActive: false,
    isPostsMode: false,
    isProjectSearchActive: false,
    items: [],
    likedProjectIds: new Set<string>(),
    loadMorePending: false,
    onDismissPost: vi.fn(),
    onDismissProject: vi.fn(),
    onFollowUser: vi.fn(),
    onLikeProject: vi.fn(),
    onLoadMoreBuilders: vi.fn(),
    onLoadMorePosts: vi.fn(),
    onLoadMoreProjects: vi.fn(),
    onMessageUser: vi.fn(),
    onOpenBuilderProfile: vi.fn(),
    pendingFollows: new Set<string>(),
    pendingLikes: new Set<string>(),
    pendingUserId: null,
    projectFeedLoading: false,
    projectSearchLoading: false,
    postSearchLoading: false,
    postResults: [],
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
    const { props, rerender } = renderFeed({ items: paginatedItems })

    const appendedRow = screen.getByTestId('project-project_21').parentElement
    expect(appendedRow).not.toBeNull()
    expect(appendedRow?.getAttribute('data-motion-row')).toBeNull()

    rerender(<ExploreFeed {...props} dismissedIds={new Set(['project_1'])} />)

    expect(
      screen
        .getByTestId('project-project_21')
        .parentElement?.getAttribute('data-motion-row'),
    ).toBeNull()
  })

  it('keeps post-search pagination static but animates a fresh result set', () => {
    const initialPosts = Array.from({ length: 10 }, (_, index) => ({
      ...post,
      _id: `post_${index + 1}` as Id<'posts'>,
      body: `Post ${index + 1}`,
    }))
    const { props, rerender } = renderFeed({
      isPostsMode: true,
      postResults: initialPosts,
    })

    const getPostRow = (body: string) =>
      screen.getByText(body).closest('.lx-card')?.parentElement

    expect(getPostRow('Post 1')?.getAttribute('data-motion-row')).toBe('true')

    rerender(
      <ExploreFeed
        {...props}
        isPostsMode
        postResults={Array.from({ length: 30 }, (_, index) => ({
          ...post,
          _id: `post_${index + 1}` as Id<'posts'>,
          body: `Post ${index + 1}`,
        }))}
      />,
    )

    expect(getPostRow('Post 11')?.getAttribute('data-motion-row')).toBeNull()

    rerender(
      <ExploreFeed
        {...props}
        entranceKey='["posts","global",[],"new query"]'
        isPostsMode
        postResults={Array.from({ length: 10 }, (_, index) => ({
          ...post,
          _id: `new_post_${index + 1}` as Id<'posts'>,
          body: `Fresh post ${index + 1}`,
        }))}
      />,
    )

    expect(getPostRow('Fresh post 1')?.getAttribute('data-motion-row')).toBe(
      'true',
    )
  })

  it('renders projects only in projects mode', () => {
    renderFeed({
      builderResults: [builder],
      items: [project],
      postResults: [post],
    })

    expect(screen.getByText('locatic/app')).toBeTruthy()
    expect(screen.queryByText('Mira Builder')).toBeNull()
    expect(screen.queryByText(/Shipping map-based discovery/)).toBeNull()
    expect(screen.getByText('projects')).toBeTruthy()
    expect(
      screen
        .getByTestId('project-project_1')
        .getAttribute('data-author-placement'),
    ).toBe('header')
    expect(
      screen
        .getByTestId('project-project_1')
        .getAttribute('data-show-full-city'),
    ).toBe('true')
  })

  it('labels project search results as matching projects', () => {
    renderFeed({ isProjectSearchActive: true, items: [project] })

    expect(screen.getByText('matching projects')).toBeTruthy()
  })

  it('renders builders only in builders mode', () => {
    renderFeed({
      builderResults: [builder],
      isBuildersMode: true,
      items: [project],
      postResults: [post],
    })

    expect(screen.getByText('Mira Builder')).toBeTruthy()
    expect(screen.queryByText('locatic/app')).toBeNull()
    expect(screen.queryByText(/Shipping map-based discovery/)).toBeNull()
  })

  it('renders posts only in posts mode', () => {
    renderFeed({
      builderResults: [builder],
      isPostsMode: true,
      items: [project],
      postResults: [post],
    })

    expect(screen.getByText(/Shipping map-based discovery/)).toBeTruthy()
    expect(screen.getByText('#react')).toBeTruthy()
    expect(screen.queryByText('Mira Builder')).toBeNull()
    expect(screen.queryByText('search posts by body or topic.')).toBeNull()
    expect(screen.getByText('posts')).toBeTruthy()
  })

  it('gives explore posts an author identity (pfp + name) like project cards', () => {
    renderFeed({
      isPostsMode: true,
      postResults: [post],
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
      isPostsMode: true,
      postResults: [reactedPost],
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
      isPostsMode: true,
      postResults: [cachedPost],
    })

    expect(screen.getByText(/Shipping map-based discovery/)).toBeTruthy()
    expect(screen.getByText(/active:/)).toBeTruthy()
  })

  it('shows scoped post browse empty copy when there are no browsable posts', () => {
    renderFeed({
      isPostsMode: true,
      postResults: [],
    })

    expect(
      screen.getByText('no posts found for this city context.'),
    ).toBeTruthy()
    expect(screen.queryByText('search posts by body or topic.')).toBeNull()
  })

  it('shows global post browse empty copy when browsing everywhere', () => {
    renderFeed({
      isGlobalFeed: true,
      isPostsMode: true,
      postResults: [],
    })

    expect(screen.getByText('no posts to explore right now.')).toBeTruthy()
  })

  it('shows post browse loading before browse empty copy', () => {
    renderFeed({
      isPostsMode: true,
      postResults: [],
      postSearchLoading: true,
    })

    expect(screen.getByRole('status', { name: 'loading posts…' })).toBeTruthy()
    expect(
      screen.queryByText('no posts found for this city context.'),
    ).toBeNull()
  })

  it('renders post search results as project links', () => {
    renderFeed({
      isPostSearchActive: true,
      isPostsMode: true,
      postResults: [post],
    })

    expect(screen.getByRole('link', { name: /locatic\/app/i })).toBeTruthy()
    expect(screen.getByText('matching posts')).toBeTruthy()
  })

  it('shows post loading before no-results copy', () => {
    renderFeed({
      debouncedSearchQuery: 'react',
      isPostSearchActive: true,
      isPostsMode: true,
      postSearchLoading: true,
      postResults: [],
    })

    expect(
      screen.getByRole('status', { name: 'searching posts…' }),
    ).toBeTruthy()
    expect(screen.queryByText(/no posts found/)).toBeNull()
  })

  it('suppresses city project empty copy while the project feed is loading', () => {
    renderFeed({
      projectFeedLoading: true,
    })

    expect(screen.queryByText('no projects match these cities yet.')).toBeNull()
  })

  it('suppresses global project empty copy while the project feed is loading', () => {
    renderFeed({
      isGlobalFeed: true,
      projectFeedLoading: true,
    })

    expect(screen.queryByText('nothing to explore right now.')).toBeNull()
  })

  it('suppresses project search no-results copy while project search is loading', () => {
    renderFeed({
      isProjectSearchActive: true,
      projectSearchLoading: true,
    })

    expect(screen.queryByText('no projects found.')).toBeNull()
  })

  it('dismisses post search rows independently from the project link', () => {
    const { props } = renderFeed({
      isPostSearchActive: true,
      isPostsMode: true,
      postResults: [post],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss post' }))

    expect(props.onDismissPost).toHaveBeenCalledWith('post_1', 'post_1')
  })

  it('renders a post load-more action when more post results can be requested', () => {
    const { props } = renderFeed({
      hasMorePosts: true,
      isPostSearchActive: true,
      isPostsMode: true,
      postResults: [post],
    })

    fireEvent.click(screen.getByRole('button', { name: 'load more posts' }))

    expect(props.onLoadMorePosts).toHaveBeenCalledTimes(1)
  })

  it('keeps post results visible while a load-more request is pending', () => {
    renderFeed({
      hasMorePosts: true,
      isPostSearchActive: true,
      isPostsMode: true,
      loadMorePending: true,
      postResults: [post],
      postSearchLoading: false,
    })

    expect(screen.getByText(/Shipping map-based discovery/)).toBeTruthy()
    expect(screen.queryByText('searching posts…')).toBeNull()
    expect(screen.getByRole('button', { name: 'loading…' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('renders a project load-more action for bounded explore expansion', () => {
    const { props } = renderFeed({
      hasMoreProjects: true,
      items: [project],
    })

    fireEvent.click(screen.getByRole('button', { name: 'load more projects' }))

    expect(props.onLoadMoreProjects).toHaveBeenCalledTimes(1)
  })
})
