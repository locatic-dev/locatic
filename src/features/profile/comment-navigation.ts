import type { ProfileCommentPreview } from '@/features/contracts'

export function isCommentTargetOpenable(
  comment: ProfileCommentPreview,
): comment is ProfileCommentPreview & {
  projectOwner: string
  projectRepo: string
  targetAvailability: 'available'
} {
  return (
    comment.targetAvailability === 'available' &&
    Boolean(comment.projectOwner) &&
    Boolean(comment.projectRepo)
  )
}

export function commentAvailabilityCopy(comment: ProfileCommentPreview) {
  switch (comment.targetAvailability) {
    case 'available':
      return 'open thread'
    case 'hidden':
      return 'hidden from profile'
    case 'deleted':
    default:
      return 'project removed'
  }
}

export function getProfileCommentDestination(comment: ProfileCommentPreview) {
  if (!isCommentTargetOpenable(comment)) {
    return null
  }

  const commentId = String(comment._id)
  const thread = comment.rootCommentId ?? commentId
  const commentPath =
    comment.ancestorCommentIds.length > 0
      ? comment.ancestorCommentIds.join(',')
      : undefined
  const post =
    comment.targetType === 'post'
      ? (comment.targetPostId ?? comment.targetId)
      : undefined

  return {
    hash: `comment-${commentId}`,
    params: {
      owner: comment.projectOwner,
      repo: comment.projectRepo,
    },
    search: {
      comment: commentId,
      ...(commentPath ? { commentPath } : {}),
      ...(post ? { post } : {}),
      thread,
    },
    to: '/project/$owner/$repo' as const,
  }
}
