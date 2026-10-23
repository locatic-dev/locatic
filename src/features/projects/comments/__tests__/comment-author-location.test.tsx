// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { CommentThread } from '../comment-thread'
import type { ProjectCommentView } from '../types'

// The author location on a comment comes from the server under the privacy
// policy (review finding B2): a city id only for exact-city members, whose
// pill links to the city page; a region label renders as plain text.

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params = {},
    title,
    to,
  }: {
    children: ReactNode
    params?: Record<string, string>
    title?: string
    to: string
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_match, key: string) => params[key] ?? '')}
      title={title}
    >
      {children}
    </a>
  ),
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    results: [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
  useQuery: () => [],
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

function renderComment(authorSnapshot: ProjectCommentView['authorSnapshot']) {
  const comment = {
    _creationTime: 0,
    _id: 'comment_1' as Id<'comments'>,
    authorId: 'user_1' as Id<'users'>,
    authorSnapshot,
    content: 'Nice work',
    createdAt: 0,
    isDeleted: false,
    likesCount: 0,
    parentId: null,
    reactionCounts: {},
    replies: [],
    replyCount: 0,
    targetId: 'project_1',
    targetType: 'project',
    viewerHasLiked: false,
    viewerReactionTypes: [],
  } as unknown as ProjectCommentView

  return render(
    <CommentThread
      activeHighlightedCommentId={null}
      commentItem={comment}
      depth={0}
      expandedIds={new Set()}
      handleDeleteComment={vi.fn()}
      handleReply={vi.fn()}
      isSignedIn={false}
      onToggleReplies={vi.fn()}
      pendingDeleteIds={new Set()}
      pendingReplies={{}}
      replyDrafts={{}}
      replyingToId={null}
      setReplyDrafts={vi.fn()}
      viewerId={null}
    />,
  )
}

describe('comment author location', () => {
  it('links an exact-city author to the city page', () => {
    renderComment({
      avatarUrl: '',
      cityId: 'cities_bengaluru' as Id<'cities'>,
      cityName: 'Bengaluru, Karnataka, India',
      displayName: 'Alice',
    })

    const link = screen.getByRole('link', {
      name: /Bengaluru, Karnataka, India/,
    })
    expect(link.getAttribute('href')).toBe('/c/cities_bengaluru')
  })

  it('shows a region label as text, without a link', () => {
    renderComment({
      avatarUrl: '',
      cityId: null,
      cityName: 'Karnataka, India',
      displayName: 'Dev',
    })

    expect(screen.getByText('Karnataka, India')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Karnataka/ })).toBeNull()
  })
})
