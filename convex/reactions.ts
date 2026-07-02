import { ConvexError, v } from 'convex/values'

import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { createNotificationIfEnabled } from './lib/notifications'
import { isPublicPostVisible } from './lib/posts'
import {
  getPubliclyInteractableProject,
  isCommentPubliclyInteractable,
} from './lib/project_access'
import { enforceRateLimit } from './lib/rate_limits'
import {
  normalizeReactionEmoji,
  sanitizeReactionConfigForWrite,
} from './lib/reaction_config'
import { getCommentReactionCounts } from './lib/reactions'
import type { Doc } from './lib/types'
import { DEFAULT_REACTIONS } from './reactionConfigSeed'

const reactionDocValidator = v.object({
  _id: v.id('reactions'),
  _creationTime: v.number(),
  userId: v.id('users'),
  targetType: v.union(
    v.literal('project'),
    v.literal('post'),
    v.literal('comment'),
  ),
  targetId: v.string(),
  reactionType: v.string(),
  createdAt: v.number(),
})

async function upsertReaction(
  ctx: MutationCtx,
  viewerId: Doc<'users'>['_id'],
  targetType: 'project' | 'post' | 'comment',
  targetId: string,
  reactionType: string,
): Promise<{
  reaction: Doc<'reactions'>
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

  const reaction = await ctx.db.get(reactionId)
  if (!reaction) {
    throw new ConvexError('Reaction could not be created')
  }

  return { reaction, created: true }
}

async function assertConfiguredReaction(
  ctx: MutationCtx,
  args: {
    targetType: 'project' | 'post' | 'comment'
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
      v.union(v.literal('project'), v.literal('post'), v.literal('comment')),
    ),
  },
  returns: v.array(
    v.object({
      _id: v.id('reaction_config'),
      _creationTime: v.number(),
      key: v.optional(v.string()),
      label: v.string(),
      emoji: v.string(),
      color: v.optional(v.string()),
      targetTypes: v.array(
        v.union(v.literal('project'), v.literal('post'), v.literal('comment')),
      ),
      isActive: v.boolean(),
      sortOrder: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const configs = await ctx.db
      .query('reaction_config')
      .withIndex('by_sort_order')
      .collect()

    return configs
      .filter(
        (config) =>
          config.isActive &&
          (!args.targetType || config.targetTypes.includes(args.targetType)),
      )
      .map((config) => ({
        _id: config._id,
        _creationTime: config._creationTime,
        ...(typeof config.key === 'string' ? { key: config.key } : {}),
        label: config.label,
        emoji: normalizeReactionEmoji(config.emoji),
        ...(typeof config.color === 'string' ? { color: config.color } : {}),
        targetTypes: config.targetTypes,
        isActive: config.isActive,
        sortOrder: config.sortOrder,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      }))
  },
})

export const reactToTarget = mutation({
  args: {
    targetType: v.union(
      v.literal('project'),
      v.literal('post'),
      v.literal('comment'),
    ),
    targetId: v.string(),
    reactionType: v.string(),
  },
  returns: reactionDocValidator,
  handler: async (ctx, args): Promise<Doc<'reactions'>> => {
    const viewer = await getViewerOrThrow(ctx)
    await enforceRateLimit(ctx, 'reactionWrite', String(viewer._id))
    await assertConfiguredReaction(ctx, args)
    let projectTarget: Doc<'projects'> | null = null
    let postTarget: Doc<'posts'> | null = null
    let commentTarget: Doc<'comments'> | null = null
    if (args.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', args.targetId)
      projectTarget = projectId
        ? await getPubliclyInteractableProject(ctx, projectId)
        : null
      if (!projectTarget) {
        throw new ConvexError('Project not found')
      }
    }

    if (args.targetType === 'post') {
      const postId = ctx.db.normalizeId('posts', args.targetId)
      postTarget = postId ? await ctx.db.get(postId) : null
      if (
        !postTarget ||
        postTarget.deletedAt !== null ||
        !(await isPublicPostVisible(ctx, postTarget))
      ) {
        throw new ConvexError('Post not found')
      }
    }

    if (args.targetType === 'comment') {
      const commentId = ctx.db.normalizeId('comments', args.targetId)
      commentTarget = commentId ? await ctx.db.get(commentId) : null
      if (
        !commentTarget ||
        !(await isCommentPubliclyInteractable(ctx, commentTarget))
      ) {
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

    if (postTarget) {
      const reactionCounts = {
        ...postTarget.reactionCounts,
        [args.reactionType]:
          (postTarget.reactionCounts[args.reactionType] ?? 0) + 1,
      }

      await ctx.db.patch(postTarget._id, {
        reactionCounts,
        updatedAt: Date.now(),
      })

      const owner = await ctx.db.get(postTarget.ownerId)
      if (owner) {
        await createNotificationIfEnabled(ctx, {
          recipient: owner,
          actor: viewer,
          type: 'post_reacted',
          projectId: postTarget.projectId,
          postId: postTarget._id,
          projectName: postTarget.projectSnapshot.name,
        })
      }
    }

    if (commentTarget) {
      const currentReactionCounts = getCommentReactionCounts(commentTarget)
      const reactionCounts = {
        ...currentReactionCounts,
        [args.reactionType]:
          (currentReactionCounts[args.reactionType] ?? 0) + 1,
      }
      await ctx.db.patch(commentTarget._id, {
        reactionCounts,
        likesCount:
          args.reactionType === 'like'
            ? commentTarget.likesCount + 1
            : commentTarget.likesCount,
      })
    }

    return reaction
  },
})

export const unreactFromTarget = mutation({
  args: {
    targetType: v.union(
      v.literal('project'),
      v.literal('post'),
      v.literal('comment'),
    ),
    targetId: v.string(),
    reactionType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    await enforceRateLimit(ctx, 'reactionWrite', String(viewer._id))
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
      const project = projectId
        ? await getPubliclyInteractableProject(ctx, projectId)
        : null
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

    if (args.targetType === 'post') {
      const postId = ctx.db.normalizeId('posts', args.targetId)
      const post = postId ? await ctx.db.get(postId) : null
      if (
        post &&
        post.deletedAt === null &&
        (await isPublicPostVisible(ctx, post))
      ) {
        const nextCount = Math.max(
          0,
          (post.reactionCounts[args.reactionType] ?? 0) - 1,
        )
        await ctx.db.patch(post._id, {
          reactionCounts: {
            ...post.reactionCounts,
            [args.reactionType]: nextCount,
          },
          updatedAt: Date.now(),
        })
      }
    }

    if (args.targetType === 'comment') {
      const commentId = ctx.db.normalizeId('comments', args.targetId)
      const comment = commentId ? await ctx.db.get(commentId) : null
      if (comment && (await isCommentPubliclyInteractable(ctx, comment))) {
        const currentReactionCounts = getCommentReactionCounts(comment)
        const nextReactionCount = Math.max(
          0,
          (currentReactionCounts[args.reactionType] ?? 0) - 1,
        )
        await ctx.db.patch(comment._id, {
          reactionCounts: {
            ...currentReactionCounts,
            [args.reactionType]: nextReactionCount,
          },
          likesCount:
            args.reactionType === 'like'
              ? Math.max(0, comment.likesCount - 1)
              : comment.likesCount,
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
    let sanitized = 0
    const now = Date.now()
    const existingConfigs = await ctx.db.query('reaction_config').collect()

    for (const config of existingConfigs) {
      const sanitizedConfig = sanitizeReactionConfigForWrite(config)
      if (
        'icon' in config ||
        sanitizedConfig.emoji !== config.emoji ||
        sanitizedConfig.color !== config.color
      ) {
        await ctx.db.replace(config._id, sanitizedConfig)
        sanitized += 1
      }
    }

    for (const reaction of DEFAULT_REACTIONS) {
      const existing = await ctx.db
        .query('reaction_config')
        .withIndex('by_key', (query) => query.eq('key', reaction.key))
        .unique()

      if (existing) {
        await ctx.db.replace(existing._id, {
          key: reaction.key,
          label: reaction.label,
          emoji: reaction.emoji,
          color: reaction.color,
          targetTypes: reaction.targetTypes,
          isActive: reaction.isActive,
          sortOrder: reaction.sortOrder,
          createdAt: existing.createdAt,
          updatedAt: now,
        })
        updated += 1
        continue
      }

      await ctx.db.insert('reaction_config', {
        key: reaction.key,
        label: reaction.label,
        emoji: reaction.emoji,
        color: reaction.color,
        targetTypes: reaction.targetTypes,
        isActive: reaction.isActive,
        sortOrder: reaction.sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      created += 1
    }

    return { created, sanitized, updated }
  },
})
