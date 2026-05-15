import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { buildActorSnapshot } from './lib/snapshots'
import { createNotificationIfEnabled } from './lib/notifications'

export const listByTarget = query({
  args: {
    targetType: v.union(v.literal('project'), v.literal('update')),
    targetId: v.string(),
    sort: v.union(v.literal('newest'), v.literal('top')),
  },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_target_parent', (query) =>
        query.eq('targetId', args.targetId).eq('parentId', null),
      )
      .collect()

    if (args.sort === 'top') {
      return comments.sort((left, right) => right.likesCount - left.likesCount)
    }

    return comments.sort((left, right) => right.createdAt - left.createdAt)
  },
})

export const create = mutation({
  args: {
    targetType: v.union(v.literal('project'), v.literal('update')),
    targetId: v.string(),
    parentId: v.union(v.id('comments'), v.null()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const actorSnapshot = await buildActorSnapshot(ctx.db, viewer)
    const projects =
      args.targetType === 'project'
        ? await ctx.db.query('projects').collect()
        : []
    const updates =
      args.targetType === 'update'
        ? await ctx.db.query('updates').collect()
        : []
    const projectTarget =
      args.targetType === 'project'
        ? (projects.find((project) => String(project._id) === args.targetId) ??
          null)
        : null
    const updateTarget =
      args.targetType === 'update'
        ? (updates.find((update) => String(update._id) === args.targetId) ??
          null)
        : null

    if (!projectTarget && !updateTarget) {
      throw new ConvexError('Comment target not found')
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId)
      if (!parent || parent.parentId) {
        throw new ConvexError('Replies are limited to one level')
      }

      await ctx.db.patch(parent._id, {
        replyCount: parent.replyCount + 1,
      })
    }

    const commentId = await ctx.db.insert('comments', {
      targetType: args.targetType,
      targetId: args.targetId,
      authorId: viewer._id,
      parentId: args.parentId,
      content: args.content,
      replyCount: 0,
      likesCount: 0,
      isDeleted: false,
      authorSnapshot: actorSnapshot,
      createdAt: Date.now(),
    })

    if (args.targetType === 'project') {
      const project = projectTarget
      if (project) {
        await ctx.db.patch(project._id, {
          locatic: {
            ...project.locatic,
            commentsCount: project.locatic.commentsCount + 1,
          },
          updatedAt: Date.now(),
        })

        const owner = await ctx.db.get(project.ownerId)
        if (owner) {
          await createNotificationIfEnabled(ctx, {
            recipient: owner,
            actor: viewer,
            type: 'project_commented',
            projectId: project._id,
            commentId,
            projectName: project.github.name,
          })
        }
      }
    }

    if (args.targetType === 'update') {
      const update = updateTarget
      if (update) {
        await ctx.db.patch(update._id, {
          commentsCount: update.commentsCount + 1,
        })

        const owner = await ctx.db.get(update.ownerId)
        if (owner) {
          await createNotificationIfEnabled(ctx, {
            recipient: owner,
            actor: viewer,
            type: 'project_commented',
            projectId: update.projectId,
            updateId: update._id,
            commentId,
            projectName: update.projectSnapshot.name,
          })
        }
      }
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId)
      if (parent) {
        const parentAuthor = await ctx.db.get(parent.authorId)
        if (parentAuthor) {
          await createNotificationIfEnabled(ctx, {
            recipient: parentAuthor,
            actor: viewer,
            type: 'comment_replied',
            commentId,
          })
        }
      }
    }

    return await ctx.db.get(commentId)
  },
})

export const remove = mutation({
  args: {
    commentId: v.id('comments'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const comment = await ctx.db.get(args.commentId)
    if (!comment || comment.authorId !== viewer._id) {
      throw new ConvexError('Comment not found')
    }

    await ctx.db.patch(comment._id, {
      content: '[deleted]',
      isDeleted: true,
    })

    return null
  },
})

export const report = mutation({
  args: {
    commentId: v.id('comments'),
    reason: v.union(
      v.literal('spam'),
      v.literal('abuse'),
      v.literal('harassment'),
      v.literal('other'),
    ),
    details: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    return await ctx.db.insert('reports', {
      reporterId: viewer._id,
      targetType: 'comment',
      targetId: args.commentId,
      reason: args.reason,
      details: args.details,
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
