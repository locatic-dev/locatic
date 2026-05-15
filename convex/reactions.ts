import { ConvexError, v } from 'convex/values'

import { mutation, query, type MutationCtx } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { createNotificationIfEnabled } from './lib/notifications'

async function upsertReaction(
  ctx: MutationCtx,
  viewerId: Awaited<ReturnType<typeof getViewerOrThrow>>['_id'],
  targetType: 'update' | 'comment',
  targetId: string,
  reactionType: string,
): Promise<Awaited<ReturnType<MutationCtx['db']['get']>>> {
  const existing = await ctx.db
    .query('reactions')
    .withIndex('by_user_target_reaction', (query) =>
      query
        .eq('userId', viewerId)
        .eq('targetId', targetId)
        .eq('reactionType', reactionType),
    )
    .unique()

  if (existing) {
    return existing
  }

  const reactionId = await ctx.db.insert('reactions', {
    userId: viewerId,
    targetType,
    targetId,
    reactionType,
    createdAt: Date.now(),
  })

  return await ctx.db.get(reactionId)
}

export const listConfig = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('reaction_config')
      .withIndex('by_sort_order')
      .collect()
  },
})

export const reactToTarget = mutation({
  args: {
    targetType: v.union(v.literal('update'), v.literal('comment')),
    targetId: v.string(),
    reactionType: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const viewer = await getViewerOrThrow(ctx)
    const reaction = await upsertReaction(
      ctx,
      viewer._id,
      args.targetType,
      args.targetId,
      args.reactionType,
    )

    if (args.targetType === 'update') {
      const updates = await ctx.db.query('updates').collect()
      const update = updates.find(
        (entry) => String(entry._id) === args.targetId,
      )
      if (!update) {
        throw new ConvexError('Update not found')
      }

      const reactionCounts = {
        ...update.reactionCounts,
        [args.reactionType]:
          (update.reactionCounts[args.reactionType] ?? 0) + 1,
      }

      await ctx.db.patch(update._id, {
        reactionCounts,
      })

      const owner = await ctx.db.get(update.ownerId)
      if (owner) {
        await createNotificationIfEnabled(ctx, {
          recipient: owner,
          actor: viewer,
          type: 'update_reacted',
          projectId: update.projectId,
          updateId: update._id,
          projectName: update.projectSnapshot.name,
        })
      }
    }

    if (args.targetType === 'comment') {
      const comments = await ctx.db.query('comments').collect()
      const comment = comments.find(
        (entry) => String(entry._id) === args.targetId,
      )
      if (!comment) {
        throw new ConvexError('Comment not found')
      }

      await ctx.db.patch(comment._id, {
        likesCount: comment.likesCount + 1,
      })
    }

    return reaction
  },
})

export const unreactFromTarget = mutation({
  args: {
    targetType: v.union(v.literal('update'), v.literal('comment')),
    targetId: v.string(),
    reactionType: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const existing = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_reaction', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetId', args.targetId)
          .eq('reactionType', args.reactionType),
      )
      .unique()

    if (!existing) {
      return null
    }

    await ctx.db.delete(existing._id)

    if (args.targetType === 'update') {
      const updates = await ctx.db.query('updates').collect()
      const update = updates.find(
        (entry) => String(entry._id) === args.targetId,
      )
      if (update) {
        const nextCount = Math.max(
          0,
          (update.reactionCounts[args.reactionType] ?? 0) - 1,
        )
        await ctx.db.patch(update._id, {
          reactionCounts: {
            ...update.reactionCounts,
            [args.reactionType]: nextCount,
          },
        })
      }
    }

    if (args.targetType === 'comment') {
      const comments = await ctx.db.query('comments').collect()
      const comment = comments.find(
        (entry) => String(entry._id) === args.targetId,
      )
      if (comment) {
        await ctx.db.patch(comment._id, {
          likesCount: Math.max(0, comment.likesCount - 1),
        })
      }
    }

    return null
  },
})
