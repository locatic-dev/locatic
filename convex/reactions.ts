import { ConvexError, v } from 'convex/values'

import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { createNotificationIfEnabled } from './lib/notifications'
import type { Doc } from './lib/types'
import { DEFAULT_REACTIONS } from './reactionConfigSeed'

async function upsertReaction(
  ctx: MutationCtx,
  viewerId: Awaited<ReturnType<typeof getViewerOrThrow>>['_id'],
  targetType: 'project' | 'update' | 'comment',
  targetId: string,
  reactionType: string,
): Promise<{
  reaction: Awaited<ReturnType<MutationCtx['db']['get']>>
  created: boolean
}> {
  const existing = await ctx.db
    .query('reactions')
    .withIndex('by_user_target_type_id_reaction', (query) =>
      query
        .eq('userId', viewerId)
        .eq('targetType', targetType)
        .eq('targetId', targetId)
        .eq('reactionType', reactionType),
    )
    .unique()

  if (existing) {
    return { reaction: existing, created: false }
  }

  const reactionId = await ctx.db.insert('reactions', {
    userId: viewerId,
    targetType,
    targetId,
    reactionType,
    createdAt: Date.now(),
  })

  return { reaction: await ctx.db.get(reactionId), created: true }
}

async function assertConfiguredReaction(
  ctx: MutationCtx,
  args: {
    targetType: 'project' | 'update' | 'comment'
    reactionType: string
  },
) {
  const config = await ctx.db
    .query('reaction_config')
    .withIndex('by_key', (query) => query.eq('key', args.reactionType))
    .unique()

  if (!config && args.reactionType === 'like') {
    return
  }

  if (
    !config ||
    !config.isActive ||
    !config.targetTypes.includes(args.targetType)
  ) {
    throw new ConvexError('Reaction is not available for this target')
  }
}

export const listConfig = query({
  args: {
    targetType: v.optional(
      v.union(v.literal('project'), v.literal('update'), v.literal('comment')),
    ),
  },
  handler: async (ctx, args) => {
    const configs = await ctx.db
      .query('reaction_config')
      .withIndex('by_sort_order')
      .collect()

    return configs.filter(
      (config) =>
        config.isActive &&
        (!args.targetType || config.targetTypes.includes(args.targetType)),
    )
  },
})

export const reactToTarget = mutation({
  args: {
    targetType: v.union(
      v.literal('project'),
      v.literal('update'),
      v.literal('comment'),
    ),
    targetId: v.string(),
    reactionType: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const viewer = await getViewerOrThrow(ctx)
    await assertConfiguredReaction(ctx, args)
    let projectTarget: Doc<'projects'> | null = null
    let updateTarget: Doc<'updates'> | null = null
    let commentTarget: Doc<'comments'> | null = null
    if (args.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', args.targetId)
      projectTarget = projectId ? await ctx.db.get(projectId) : null
      if (!projectTarget) {
        throw new ConvexError('Project not found')
      }
    }

    if (args.targetType === 'update') {
      const updateId = ctx.db.normalizeId('updates', args.targetId)
      updateTarget = updateId ? await ctx.db.get(updateId) : null
      if (!updateTarget) {
        throw new ConvexError('Update not found')
      }
    }

    if (args.targetType === 'comment') {
      const commentId = ctx.db.normalizeId('comments', args.targetId)
      commentTarget = commentId ? await ctx.db.get(commentId) : null
      if (!commentTarget) {
        throw new ConvexError('Comment not found')
      }
    }

    const { reaction, created } = await upsertReaction(
      ctx,
      viewer._id,
      args.targetType,
      args.targetId,
      args.reactionType,
    )

    if (!created) {
      return reaction
    }

    if (projectTarget && args.reactionType === 'like') {
      await ctx.db.patch(projectTarget._id, {
        locatic: {
          ...projectTarget.locatic,
          likesCount: projectTarget.locatic.likesCount + 1,
        },
        updatedAt: Date.now(),
      })
    }

    if (updateTarget) {
      const reactionCounts = {
        ...updateTarget.reactionCounts,
        [args.reactionType]:
          (updateTarget.reactionCounts[args.reactionType] ?? 0) + 1,
      }

      await ctx.db.patch(updateTarget._id, {
        reactionCounts,
      })

      const owner = await ctx.db.get(updateTarget.ownerId)
      if (owner) {
        await createNotificationIfEnabled(ctx, {
          recipient: owner,
          actor: viewer,
          type: 'update_reacted',
          projectId: updateTarget.projectId,
          updateId: updateTarget._id,
          projectName: updateTarget.projectSnapshot.name,
        })
      }
    }

    if (commentTarget) {
      await ctx.db.patch(commentTarget._id, {
        likesCount: commentTarget.likesCount + 1,
      })
    }

    return reaction
  },
})

export const unreactFromTarget = mutation({
  args: {
    targetType: v.union(
      v.literal('project'),
      v.literal('update'),
      v.literal('comment'),
    ),
    targetId: v.string(),
    reactionType: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const existing = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_type_id_reaction', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetType', args.targetType)
          .eq('targetId', args.targetId)
          .eq('reactionType', args.reactionType),
      )
      .unique()

    if (!existing) {
      return null
    }

    await ctx.db.delete(existing._id)

    if (args.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', args.targetId)
      const project = projectId ? await ctx.db.get(projectId) : null
      if (project && args.reactionType === 'like') {
        await ctx.db.patch(project._id, {
          locatic: {
            ...project.locatic,
            likesCount: Math.max(0, project.locatic.likesCount - 1),
          },
          updatedAt: Date.now(),
        })
      }
    }

    if (args.targetType === 'update') {
      const updateId = ctx.db.normalizeId('updates', args.targetId)
      const update = updateId ? await ctx.db.get(updateId) : null
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
      const commentId = ctx.db.normalizeId('comments', args.targetId)
      const comment = commentId ? await ctx.db.get(commentId) : null
      if (comment) {
        await ctx.db.patch(comment._id, {
          likesCount: Math.max(0, comment.likesCount - 1),
        })
      }
    }

    return null
  },
})

export const seedDefaultReactions = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0
    let updated = 0
    const now = Date.now()

    for (const reaction of DEFAULT_REACTIONS) {
      const existing = await ctx.db
        .query('reaction_config')
        .withIndex('by_key', (query) => query.eq('key', reaction.key))
        .unique()

      if (existing) {
        await ctx.db.patch(existing._id, {
          label: reaction.label,
          emoji: reaction.icon,
          icon: reaction.icon,
          targetTypes: reaction.targetTypes,
          isActive: reaction.isActive,
          sortOrder: reaction.sortOrder,
          updatedAt: now,
        })
        updated += 1
        continue
      }

      await ctx.db.insert('reaction_config', {
        key: reaction.key,
        label: reaction.label,
        emoji: reaction.icon,
        icon: reaction.icon,
        targetTypes: reaction.targetTypes,
        isActive: reaction.isActive,
        sortOrder: reaction.sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      created += 1
    }

    return { created, updated }
  },
})
