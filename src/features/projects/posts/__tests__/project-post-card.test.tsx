// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { ProjectPostCard } from '../project-post-card'

const mocks = vi.hoisted(() => ({
  deletePost: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    loadMore: vi.fn(),
    results: [],
    status: 'Exhausted',
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

function renderPost(commentsCount: number) {
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
  } as unknown as Parameters<typeof ProjectPostCard>[0]['post']

  return render(
    <ProjectPostCard
      activeHighlightedCommentId={null}
      highlightedCommentPath={[]}
      isOwner
      isSignedIn
      post={post}
      projectDetailQueryKey={['project']}
      viewerId="user_1"
    />,
  )
}

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
