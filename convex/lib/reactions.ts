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
