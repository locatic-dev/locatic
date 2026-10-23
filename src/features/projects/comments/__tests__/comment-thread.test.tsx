// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { CommentThread } from '../comment-thread'
import type { ProjectCommentView } from '../types'

let paginatedState: {
  results: ProjectCommentView[]
  status: string
  loadMore: ReturnType<typeof vi.fn>
}

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => paginatedState,
  useQuery: () => [
    {
      key: 'like',
      label: 'Like',
      emoji: '❤️',
    },
  ],
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: {
    comments: { listReplies: 'comments.listReplies' },
    reactions: { listConfig: 'reactions.listConfig' },
  },
}))

vi.mock('@/features/projects/mutations', () => ({
  useReactToTarget: () => vi.fn(),
  useUnreactFromTarget: () => vi.fn(),
}))

function makeComment(
  overrides: Partial<ProjectCommentView> = {},
): ProjectCommentView {
  const id = (overrides._id ?? 'comment_1') as Id<'comments'>

  return {
    _creationTime: Date.now(),
    _id: id,
    authorId: 'user_1' as Id<'users'>,
    authorSnapshot: {
      avatarUrl: null,
      cityId: null,
      cityName: null,
      displayName: 'Saroj Pedada',
    },
    content: 'Parent comment',
    createdAt: Date.now(),
    isDeleted: false,
    likesCount: 0,
    parentId: null,
    reactionCounts: {},
    replies: [],
    replyCount: 0,
    targetId: 'project_1',
    targetSnapshot: {
      fullName: 'locatic/app',
      name: 'app',
      ownerLogin: 'locatic',
    },
    targetType: 'project',
    viewerHasLiked: false,
    viewerReactionTypes: [],
    ...overrides,
  } as ProjectCommentView
}

function renderThread(overrides: Partial<Parameters<typeof CommentThread>[0]>) {
  const commentItem = overrides.commentItem ?? makeComment({ replyCount: 1 })

  return render(
    <CommentThread
      activeHighlightedCommentId={null}
      commentItem={commentItem}
      depth={0}
      expandedIds={new Set([String(commentItem._id)])}
      handleDeleteComment={vi.fn()}
      handleReply={vi.fn()}
      isSignedIn={true}
      onToggleReplies={vi.fn()}
      pendingDeleteIds={new Set()}
      pendingReplies={{}}
      replyDrafts={{}}
      replyingToId={null}
      setReplyDrafts={vi.fn()}
      viewerId="user_2"
      {...overrides}
    />,
  )
}

beforeEach(() => {
  paginatedState = {
    results: [],
    status: 'LoadingFirstPage',
    loadMore: vi.fn(),
  }
})

describe('CommentThread', () => {
  it('does not show a perpetual loader for a destination with no replies to fetch', () => {
    renderThread({ commentItem: makeComment({ replyCount: 0 }) })
    expect(screen.queryByRole('status', { name: 'Loading replies' })).toBeNull()
  })
  it('keeps loaded replies visible without showing a first-page skeleton', () => {
    paginatedState = {
      results: [
        makeComment({
          _id: 'comment_reply_1' as Id<'comments'>,
          content: 'Loaded reply',
          parentId: 'comment_1' as Id<'comments'>,
        }),
      ],
      status: 'LoadingFirstPage',
      loadMore: vi.fn(),
    }

    renderThread({})

    expect(screen.getByText('Loaded reply')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Loading replies' })).toBeNull()
  })

  it('shows the first-page skeleton when no replies are visible yet', () => {
    renderThread({})

    expect(screen.getByRole('status', { name: 'Loading replies' })).toBeTruthy()
  })

  it('labels the reply textarea with the comment author', () => {
    renderThread({
      replyDrafts: { comment_1: '' },
    })

    expect(
      screen.getByRole('textbox', { name: 'Reply to Saroj Pedada' }),
    ).toBeDefined()
  })

  it('deletes a comment only after the confirmation, which says replies stay', () => {
    const handleDeleteComment = vi.fn()
    renderThread({ handleDeleteComment, viewerId: 'user_1' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))

    const dialog = screen.getByRole('dialog', { name: 'delete this comment?' })
    expect(dialog.textContent).toContain('replies stay.')
    expect(handleDeleteComment).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(handleDeleteComment).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    expect(handleDeleteComment).toHaveBeenCalledWith('comment_1')
  })

  it('submits a reply without requiring the composer to stay open', () => {
    const handleReply = vi.fn()
    renderThread({
      handleReply,
      pendingReplies: {
        comment_1: [
          makeComment({
            _id: 'pending-comment_1' as Id<'comments'>,
            content: 'Optimistic reply',
            parentId: 'comment_1' as Id<'comments'>,
            pending: true,
          }),
        ],
      },
      replyDrafts: {},
      replyingToId: 'comment_1',
    })

    expect(screen.getByText('Optimistic reply')).toBeTruthy()
    expect(screen.getByText('posting…')).toBeTruthy()
    expect(screen.queryByPlaceholderText('reply to Saroj Pedada…')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reply to comment' }))

    expect(handleReply).not.toHaveBeenCalled()
  })
})
