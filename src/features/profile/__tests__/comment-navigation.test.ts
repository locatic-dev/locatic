import { describe, expect, it } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { ProfileCommentPreview } from '@/features/contracts'
import {
  commentAvailabilityCopy,
  getProfileCommentDestination,
  isCommentTargetOpenable,
} from '../comment-navigation'

function profileComment(
  overrides: Partial<ProfileCommentPreview> = {},
): ProfileCommentPreview {
  return {
    _id: 'comment_1' as Id<'comments'>,
    ancestorCommentIds: [],
    content: 'nice build',
    createdAt: 1_700_000_000_000,
    likesCount: 0,
    projectFullName: 'owner/repo',
    projectOwner: 'owner',
    projectRepo: 'repo',
    replyCount: 0,
    rootCommentId: 'comment_1',
    targetAvailability: 'available',
    targetId: 'project_1',
    targetLabel: 'owner/repo',
    targetPostId: null,
    targetType: 'project',
    ...overrides,
  }
}

describe('profile comment navigation', () => {
  it('routes project comments to the project discussion thread', () => {
    const destination = getProfileCommentDestination(profileComment())

    expect(destination).toMatchObject({
      hash: 'comment-comment_1',
      params: { owner: 'owner', repo: 'repo' },
      search: {
        comment: 'comment_1',
        thread: 'comment_1',
      },
      to: '/project/$owner/$repo',
    })
  })

  it('routes post comments to the owning post and comment thread', () => {
    const destination = getProfileCommentDestination(
      profileComment({
        _id: 'comment_3' as Id<'comments'>,
        ancestorCommentIds: ['comment_1', 'comment_2'],
        rootCommentId: 'comment_1',
        targetId: 'post_1',
        targetPostId: 'post_1',
        targetType: 'post',
      }),
    )

    expect(destination).toMatchObject({
      hash: 'comment-comment_3',
      search: {
        comment: 'comment_3',
        commentPath: 'comment_1,comment_2',
        post: 'post_1',
        thread: 'comment_1',
      },
    })
  })

  it('does not open hidden or deleted targets', () => {
    const hiddenComment = profileComment({ targetAvailability: 'hidden' })

    expect(isCommentTargetOpenable(hiddenComment)).toBe(false)
    expect(getProfileCommentDestination(hiddenComment)).toBeNull()
    expect(commentAvailabilityCopy(hiddenComment)).toBe('hidden from profile')
  })
})
