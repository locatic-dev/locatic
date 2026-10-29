// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { ProjectPostCard } from '../project-post-card'

const mocks = vi.hoisted(() => ({
  deletePost: vi.fn(),
  comments: [] as unknown[],
  status: 'Exhausted',
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    loadMore: vi.fn(),
    results: mocks.comments,
    status: mocks.status,
  }),
  useQuery: () => [],
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: {
    comments: { listRootsByTarget: 'comments.listRootsByTarget' },
    reactions: { listConfig: 'reactions.listConfig' },
  },
}))

vi.mock('@/features/projects/mutations', () => ({
  useAddComment: () => vi.fn(),
  useDeleteComment: () => vi.fn(),
  useDeletePost: () => mocks.deletePost,
  useReactToTarget: () => vi.fn(),
  useUnreactFromTarget: () => vi.fn(),
  useUpdatePost: () => vi.fn(),
}))

function renderPost(
  commentsCount: number,
  destination: Partial<Parameters<typeof ProjectPostCard>[0]> = {},
  postChanges: Record<string, unknown> = {},
) {
  const post = {
    _id: 'post_1' as Id<'posts'>,
    _creationTime: 0,
    actorSnapshot: {
      avatarUrl: '',
      cityId: null,
      cityName: null,
      displayName: 'Ada',
    },
    body: 'shipped offline mode',
    commentsCount,
    createdAt: Date.now(),
    projectSnapshot: {
      fullName: 'ada/engine',
      languages: [],
      name: 'engine',
      ownerLogin: 'ada',
      primaryLanguage: null,
    },
    reactionCounts: {},
    updatedAt: Date.now(),
    viewerHasLiked: false,
    viewerReactionTypes: [],
    ...postChanges,
  } as unknown as Parameters<typeof ProjectPostCard>[0]['post']

  const page = () => (
    <ProjectPostCard
      activeHighlightedCommentId={null}
      highlightedCommentPath={[]}
      isOwner
      isSignedIn
      post={post}
      projectDetailQueryKey={['project']}
      viewerId="user_1"
      {...destination}
    />
  )
  return { page, ...render(page()) }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  mocks.comments = []
  mocks.status = 'Exhausted'
})

it('resolves a delayed post-comment destination only when its row mounts', () => {
  vi.useFakeTimers()
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  })
  const release = vi.fn()
  mocks.status = 'LoadingFirstPage'
  const { page, rerender } = renderPost(1, {
    activeHighlightedCommentId: 'late',
    onReleaseCommentHighlight: release,
  })
  act(() => {
    vi.advanceTimersByTime(5000)
  })
  expect(release).not.toHaveBeenCalled()
  expect(scroll).not.toHaveBeenCalled()

  mocks.status = 'Exhausted'
  mocks.comments = [
    {
      _id: 'late',
      authorId: 'user_1',
      authorSnapshot: { displayName: 'Ada', avatarUrl: null },
      content: 'the destination',
      createdAt: 0,
      isDeleted: false,
      replyCount: 0,
      reactionCounts: {},
      viewerReactionTypes: [],
    },
  ]
  rerender(page())
  expect(scroll).toHaveBeenCalledOnce()
  act(() => {
    vi.advanceTimersByTime(1800)
  })
  expect(release).toHaveBeenCalledExactlyOnceWith('late')
})

describe('ProjectPostCard delete', () => {
  it('deletes a post only after the confirmation, which says its comments go with it', async () => {
    mocks.deletePost.mockResolvedValue(null)
    renderPost(2)

    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }))

    const dialog = screen.getByRole('dialog', { name: 'delete this post?' })
    expect(dialog.textContent).toContain('comments go with it.')
    expect(mocks.deletePost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'delete' }))

    await waitFor(() =>
      expect(mocks.deletePost).toHaveBeenCalledWith({ postId: 'post_1' }),
    )
  })

  it('keeps the post when the confirmation is cancelled', () => {
    renderPost(0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }))
    expect(screen.getByRole('dialog').textContent).toContain(
      "this can't be undone.",
    )
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.deletePost).not.toHaveBeenCalled()
  })
})

it('does not infer a body edit from engagement or legacy updated timestamps', () => {
  renderPost(
    0,
    {},
    { createdAt: 1, updatedAt: 200, reactionCounts: { like: 1 } },
  )
  expect(screen.queryByText(/edited/)).toBeNull()
})

it('labels a post with an explicit body edit even if it happened in the creation millisecond', () => {
  renderPost(0, {}, { createdAt: 100, updatedAt: 100, editedAt: 100 })
  expect(screen.getByText(/edited/)).toBeTruthy()
})
