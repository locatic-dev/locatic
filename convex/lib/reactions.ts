import type { QueryCtx } from '../_generated/server'
import type { Doc } from './types'

export type ReactionTargetType = 'project' | 'post' | 'comment'

export function getCommentReactionCounts(
  comment: Pick<Doc<'comments'>, 'likesCount' | 'reactionCounts'>,
) {
  return comment.reactionCounts ?? { like: comment.likesCount }
}

export function getProjectReactionCounts(
  project: Pick<Doc<'projects'>, 'locatic'>,
) {
  return (
    project.locatic.reactionCounts ?? {
      like: project.locatic.likesCount,
    }
  )
}

export function applyReactionCountDelta(
  reactionCounts: Record<string, number>,
  reactionType: string,
  delta: number,
) {
  return {
    ...reactionCounts,
    [reactionType]: Math.max(0, (reactionCounts[reactionType] ?? 0) + delta),
  }
}

export function getNextProjectReactionLocatic(
  project: Pick<Doc<'projects'>, 'locatic'>,
  reactionType: string,
  delta: number,
) {
  return {
    ...project.locatic,
    likesCount:
      reactionType === 'like'
        ? Math.max(0, project.locatic.likesCount + delta)
        : project.locatic.likesCount,
    reactionCounts: applyReactionCountDelta(
      getProjectReactionCounts(project),
      reactionType,
      delta,
    ),
  }
}

export function getNextPostReactionCounts(
  post: Pick<Doc<'posts'>, 'reactionCounts'>,
  reactionType: string,
  delta: number,
) {
  return applyReactionCountDelta(post.reactionCounts, reactionType, delta)
}

export function getNextCommentReactionState(
  comment: Pick<Doc<'comments'>, 'likesCount' | 'reactionCounts'>,
  reactionType: string,
  delta: number,
) {
  return {
    reactionCounts: applyReactionCountDelta(
      getCommentReactionCounts(comment),
      reactionType,
      delta,
    ),
    likesCount:
      reactionType === 'like'
        ? Math.max(0, comment.likesCount + delta)
        : comment.likesCount,
  }
}

export async function getViewerReactionTypesByTargetId(
  ctx: QueryCtx,
  viewer: Doc<'users'> | null,
  args: {
    targetIds: string[]
    targetType: ReactionTargetType
  },
) {
  if (!viewer || args.targetIds.length === 0) {
    return new Map<string, string[]>()
  }

  const targetIds = [...new Set(args.targetIds)]
  const reactions = await Promise.all(
    targetIds.map((targetId) =>
      ctx.db
        .query('reactions')
        .withIndex('by_user_target_type_id', (query) =>
          query
            .eq('userId', viewer._id)
            .eq('targetType', args.targetType)
            .eq('targetId', targetId),
        )
        .collect(),
    ),
  )

  return new Map(
    targetIds.map((targetId, index) => [
      targetId,
      reactions[index]?.map((reaction) => reaction.reactionType) ?? [],
    ]),
  )
}

export function withViewerPostReactions(
  posts: Array<Doc<'posts'>>,
  viewerReactionTypesByTargetId: Map<string, string[]>,
) {
  return posts.map((post) => {
    const viewerReactionTypes =
      viewerReactionTypesByTargetId.get(String(post._id)) ?? []

    return {
      ...post,
      viewerHasLiked: viewerReactionTypes.includes('like'),
      viewerReactionTypes,
    }
  })
}
