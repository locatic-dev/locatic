// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { ProjectDetailPayload } from '@/features/contracts'
import { buildProjectReturnHref } from '@/features/projects/deep-link'

const mocks = vi.hoisted(() => ({
  isSignedIn: false as boolean | undefined,
  search: {} as Record<string, string>,
}))

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => vi.fn(),
    useSearch: () => mocks.search,
  }),
  // Renders the sign-in destination so the test can read it.
  Link: ({
    children,
    search,
    to,
  }: {
    children: ReactNode
    search?: { redirect?: string }
    to?: string
  }) => (
    <a
      href={
        search?.redirect
          ? `${to}?${new URLSearchParams({ redirect: search.redirect })}`
          : to
      }
    >
      {children}
    </a>
  ),
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isSignedIn: mocks.isSignedIn }),
}))

vi.mock('convex/react', () => ({
  useAction: () => vi.fn(),
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

const { ProjectView } = await import('@/features/projects/project-view')

const detail = {
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

function signInDestination(name: string) {
  const href = screen.getByRole('link', { name }).getAttribute('href') ?? ''
  return new URLSearchParams(href.split('?')[1]).get('redirect')
}

describe('project view sign-in links', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    mocks.isSignedIn = false
    mocks.search = {}
  })

  function renderView() {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProjectView detail={detail} owner="ada" repo="engine" />
      </QueryClientProvider>,
    )
  }

  it('return a visitor to the same deep link, query and hash included', () => {
    mocks.search = { post: 'p1' }
    window.history.replaceState(null, '', '/project/ada/engine?post=p1#readme')

    renderView()

    expect(signInDestination('sign in to save')).toBe(
      '/project/ada/engine?post=p1#readme',
    )
  })

  it('keep the hash on the comment sign-in link', () => {
    window.history.replaceState(null, '', '/project/ada/engine#readme')

    renderView()

    expect(signInDestination('sign in')).toBe('/project/ada/engine#readme')
    expect(signInDestination('sign in to save')).toBe(
      '/project/ada/engine#readme',
    )
  })

  it('offer a visitor sign-in to follow the owner instead of dead controls', () => {
    window.history.replaceState(null, '', '/project/ada/engine?post=p1')
    mocks.search = { post: 'p1' }

    renderView()

    expect(signInDestination('sign in to follow')).toBe(
      '/project/ada/engine?post=p1',
    )
    expect(screen.queryByRole('button', { name: 'follow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'message' })).toBeNull()
  })

  it('hold a quiet disabled follow while Clerk is still loading', () => {
    mocks.isSignedIn = undefined

    renderView()

    const follow = screen.getByRole<HTMLButtonElement>('button', {
      name: 'follow',
    })
    expect(follow.disabled).toBe(true)
    // Secondary, not the solid brand fill the live follow control uses.
    expect(follow.className).not.toContain('bg-brand')
    expect(screen.queryByRole('link', { name: 'sign in to follow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'message' })).toBeNull()
  })

  it('let a signed-in viewer follow and message the owner', () => {
    mocks.isSignedIn = true

    renderView()

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'follow' })
        .disabled,
    ).toBe(false)
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'message' })
        .disabled,
    ).toBe(false)
    expect(screen.queryByRole('link', { name: 'sign in to follow' })).toBeNull()
  })
})

describe('buildProjectReturnHref', () => {
  it('keeps only the deep-link keys and encodes the route params', () => {
    expect(
      buildProjectReturnHref({
        owner: 'ada lovelace',
        repo: 'engine',
        search: { post: 'p1', thread: 't1', tab: 'x', comment: '  ' },
      }),
    ).toBe('/project/ada%20lovelace/engine?post=p1&thread=t1')
  })

  it('omits the query when there is no deep link', () => {
    expect(
      buildProjectReturnHref({ owner: 'ada', repo: 'engine', search: {} }),
    ).toBe('/project/ada/engine')
  })
})
