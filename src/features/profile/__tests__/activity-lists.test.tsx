// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'
import type {
  ProfileCommentPreview,
  ProfilePostPreview,
} from '@/features/contracts'
import { ProfileCommentList } from '../comment-list'
import { ProfilePostList } from '../post-list'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate }),
}))

vi.mock('@/features/projects/reactions/reaction-bar', () => ({
  ReactionBar: ({
    targetId,
    targetType,
  }: {
    targetId: string
    targetType: string
  }) => (
    <button type="button">
      react {targetType} {targetId}
    </button>
  ),
}))

const post = {
  _id: 'post_1' as Id<'posts'>,
  _creationTime: Date.now(),
  actorId: 'user_1' as Id<'users'>,
  actorSnapshot: {
    avatarUrl: 'https://example.com/avatar.png',
    cityId: null,
    cityName: null,
    displayName: 'Saketha Rama',
  },
  authorRole: 'owner',
  body: 'shipping a better profile feed',
  commentsCount: 2,
  createdAt: Date.now(),
  deletedAt: null,
  ownerId: 'user_1' as Id<'users'>,
  projectCityId: null,
  projectId: 'project_1' as Id<'projects'>,
  projectSnapshot: {
    fullName: 'saketha/locatic',
    languages: [],
    name: 'locatic',
    ownerLogin: 'saketha',
    primaryLanguage: 'TypeScript',
  },
  projectTopics: ['social'],
  reactionCounts: { like: 3 },
  updatedAt: Date.now(),
  viewerHasLiked: true,
  viewerReactionTypes: ['like'],
} satisfies ProfilePostPreview

const comment = {
  _id: 'comment_1' as Id<'comments'>,
  ancestorCommentIds: [],
  content: 'this looks much clearer',
  createdAt: Date.now(),
  likesCount: 1,
  projectFullName: 'saketha/locatic',
  projectOwner: 'saketha',
  projectRepo: 'locatic',
  reactionCounts: { like: 1 },
  replyCount: 2,
  rootCommentId: 'comment_1',
  targetAvailability: 'available',
  targetId: 'project_1',
  targetLabel: 'saketha/locatic',
  targetPostId: null,
  targetType: 'project',
  viewerHasLiked: true,
  viewerReactionTypes: ['like'],
} satisfies ProfileCommentPreview

describe('profile activity lists', () => {
  it('renders posts author-first with reactions outside navigation', () => {
    render(<ProfilePostList emptyLabel="none" posts={[post]} />)

    expect(screen.getByText('Saketha Rama')).toBeTruthy()
    expect(screen.getByText('saketha/locatic')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /react post post_1/i }))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders comments author-first and keeps reactions independent', () => {
    const onOpenComment = vi.fn()
    render(
      <ProfileCommentList
        authorName="Saketha Rama"
        comments={[comment]}
        emptyLabel="none"
        onOpenComment={onOpenComment}
        reactionsDisabled={false}
      />,
    )

    expect(screen.getByText('Saketha Rama')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: /react comment comment_1/i }),
    )
    expect(onOpenComment).not.toHaveBeenCalled()
    expect(screen.getByText(/2 replies/i)).toBeTruthy()
  })
})
