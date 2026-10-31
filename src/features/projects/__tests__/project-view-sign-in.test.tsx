// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { ProjectDetailPayload } from '@/features/contracts'
import { buildProjectReturnHref } from '@/features/projects/deep-link'
import type { ProjectCommentView } from '@/features/projects/comments/types'

type CommentPage = {
  results: ProjectCommentView[]
  status: string
  loadMore: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  isSignedIn: false as boolean | undefined,
  search: {} as Record<string, string>,
  navigate: vi.fn(),
  roots: { results: [], status: 'Exhausted', loadMore: vi.fn() } as CommentPage,
  replies: {} as Record<string, CommentPage>,
  scroll: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigate,
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

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('convex/react', () => ({
  useAction: () => vi.fn(),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
  useMutation: () => vi.fn(),
  usePaginatedQuery: (_reference: unknown, args: Record<string, string>) =>
    args.targetType === 'project'
      ? mocks.roots
      : (mocks.replies[args.parentId] ?? {
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

function renderView() {
  const queryClient = new QueryClient()
  const page = () => (
    <QueryClientProvider client={queryClient}>
      <ProjectView detail={detail} owner="ada" repo="engine" />
    </QueryClientProvider>
  )
  return { page, ...render(page()) }
}

function commentItem(id: string, replyCount = 0): ProjectCommentView {
  return {
    _id: id,
    _creationTime: 0,
    authorId: 'user_1',
    authorSnapshot: { displayName: 'Ada', avatarUrl: null, cityName: null },
    content: `comment ${id}`,
    createdAt: 0,
    isDeleted: false,
    likesCount: 0,
    parentId: null,
    reactionCounts: {},
    replies: [],
    replyCount,
    targetId: 'project_1',
    targetType: 'project',
    viewerReactionTypes: [],
  } as unknown as ProjectCommentView
}

beforeEach(() => {
  mocks.roots = { results: [], status: 'Exhausted', loadMore: vi.fn() }
  mocks.replies = {}
  mocks.search = {}
  mocks.navigate.mockReset()
  mocks.scroll.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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

describe('comment destination resolution', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: mocks.scroll,
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  it('retains a delayed target, then scrolls once before releasing it', () => {
    mocks.search = { comment: 'older' }
    mocks.roots.status = 'LoadingFirstPage'
    const { page, rerender } = renderView()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.scroll).not.toHaveBeenCalled()

    mocks.roots = {
      ...mocks.roots,
      results: [commentItem('older')],
      status: 'Exhausted',
    }
    rerender(page())
    expect(mocks.scroll).toHaveBeenCalledOnce()
    expect(mocks.scroll).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })
    act(() => {
      vi.advanceTimersByTime(1799)
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(mocks.navigate).toHaveBeenCalledOnce()
    const navigation = mocks.navigate.mock.calls[0][0]
    expect(navigation.resetScroll).toBe(false)
    expect(
      navigation.search({
        comment: 'older',
        thread: 'root',
        commentPath: 'root',
        post: 'p1',
        keep: 'yes',
      }),
    ).toEqual({ post: 'p1', keep: 'yes' })
    rerender(page())
    expect(mocks.scroll).toHaveBeenCalledOnce()
  })

  it('uses instant scrolling under reduced motion without discarding a pending target', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    mocks.search = { comment: 'older' }
    mocks.roots.status = 'LoadingFirstPage'
    const { page, rerender } = renderView()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.navigate).not.toHaveBeenCalled()

    mocks.roots = {
      ...mocks.roots,
      results: [commentItem('older')],
      status: 'Exhausted',
    }
    rerender(page())
    expect(mocks.scroll).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'center',
    })
    act(() => {
      vi.runOnlyPendingTimers()
    })
    expect(mocks.navigate).toHaveBeenCalledOnce()
  })

  it('keeps root pagination active while later pages are delayed', () => {
    mocks.search = { comment: 'older' }
    mocks.roots.status = 'CanLoadMore'
    const { page, rerender } = renderView()
    expect(mocks.roots.loadMore).toHaveBeenCalledWith(10)
    mocks.roots = { ...mocks.roots, status: 'LoadingMore' }
    rerender(page())
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
    mocks.roots = { ...mocks.roots, status: 'CanLoadMore' }
    rerender(page())
    expect(mocks.roots.loadMore.mock.calls.length).toBeGreaterThan(1)
  })

  it('waits for a nested reply to mount even when the root count stays unchanged', () => {
    mocks.search = { comment: 'reply', commentPath: 'root', thread: 'root' }
    mocks.roots.results = [commentItem('root', 1)]
    mocks.replies.root = {
      results: [],
      status: 'LoadingFirstPage',
      loadMore: vi.fn(),
    }
    const { page, rerender } = renderView()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
    mocks.replies.root.results = [commentItem('reply')]
    mocks.replies.root.status = 'Exhausted'
    rerender(page())
    expect(mocks.scroll).toHaveBeenCalledOnce()
    expect((mocks.scroll.mock.contexts[0] as HTMLElement).id).toBe(
      'comment-reply',
    )
    act(() => {
      vi.advanceTimersByTime(1800)
    })
    expect(mocks.navigate).toHaveBeenCalledOnce()
  })

  it('automatically loads later reply pages along the destination path', () => {
    mocks.search = { comment: 'reply', commentPath: 'root', thread: 'root' }
    mocks.roots.results = [commentItem('root', 20)]
    mocks.replies.root = {
      results: [commentItem('other')],
      status: 'CanLoadMore',
      loadMore: vi.fn(),
    }
    renderView()
    expect(mocks.replies.root.loadMore).toHaveBeenCalledWith(6)
  })

  it('leaves an exhausted missing target intact without scrolling or clearing another destination', () => {
    mocks.search = { comment: 'missing' }
    mocks.roots.results = [commentItem('other')]
    renderView()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.roots.loadMore).not.toHaveBeenCalled()
    expect(mocks.scroll).not.toHaveBeenCalled()
  })

  it('bounds automatic reply paging and resets the bound for a new destination', () => {
    mocks.search = { comment: 'missing', commentPath: 'root' }
    mocks.roots.results = [commentItem('root', 100)]
    const loadMore = vi.fn()
    mocks.replies.root = { results: [], status: 'CanLoadMore', loadMore }
    const { page, rerender } = renderView()
    for (let index = 0; index < 8; index++) {
      mocks.replies.root = { results: [], status: 'CanLoadMore', loadMore }
      rerender(page())
    }
    expect(loadMore).toHaveBeenCalledTimes(5)
    expect(mocks.navigate).not.toHaveBeenCalled()
    mocks.search = { comment: 'another', commentPath: 'root' }
    rerender(page())
    expect(loadMore).toHaveBeenCalledTimes(6)
  })

  it('loads a missing ancestor before resolving a deeper reply', () => {
    mocks.search = { comment: 'leaf', commentPath: 'root,middle' }
    mocks.roots.results = [commentItem('root', 10)]
    mocks.replies.root = {
      results: [],
      status: 'CanLoadMore',
      loadMore: vi.fn(),
    }
    mocks.replies.middle = {
      results: [],
      status: 'LoadingFirstPage',
      loadMore: vi.fn(),
    }
    const { page, rerender } = renderView()
    expect(mocks.replies.root.loadMore).toHaveBeenCalledWith(6)
    mocks.replies.root = {
      ...mocks.replies.root,
      results: [commentItem('middle', 1)],
      status: 'Exhausted',
    }
    rerender(page())
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.scroll).not.toHaveBeenCalled()
    mocks.replies.middle = {
      ...mocks.replies.middle,
      results: [commentItem('leaf')],
      status: 'Exhausted',
    }
    rerender(page())
    expect((mocks.scroll.mock.contexts[0] as HTMLElement).id).toBe(
      'comment-leaf',
    )
  })

  it('cancels the old release when navigation selects a different target', () => {
    mocks.search = { comment: 'first' }
    mocks.roots.results = [commentItem('first')]
    const { page, rerender } = renderView()
    expect(mocks.scroll).toHaveBeenCalledOnce()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    mocks.search = { comment: 'second' }
    mocks.roots.results = []
    mocks.roots.status = 'LoadingFirstPage'
    rerender(page())
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
    mocks.roots.results = [commentItem('second')]
    mocks.roots.status = 'Exhausted'
    rerender(page())
    expect(mocks.scroll).toHaveBeenCalledTimes(2)
    act(() => {
      vi.advanceTimersByTime(1800)
    })
    expect(mocks.navigate).toHaveBeenCalledOnce()
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
