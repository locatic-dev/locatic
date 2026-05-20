import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { fanOutActivityEventToFollowers } from './lib/homeFeed'
import type { Doc } from './lib/types'
import { buildActorSnapshot, buildProjectSnapshot } from './lib/snapshots'
import {
  buildProjectNotificationTarget,
  createNotificationIfEnabled,
} from './lib/notifications'

export const listByTarget = query({
  args: {
    targetType: v.union(v.literal('project'), v.literal('update')),
    targetId: v.string(),
    sort: v.union(v.literal('newest'), v.literal('top')),
  },
  handler: async (ctx, args) => {
    const allComments = await ctx.db
      .query('comments')
      .withIndex('by_target_created', (query) =>
        query.eq('targetId', args.targetId),
      )
      .collect()

    const topLevelComments = allComments.filter(
      (comment) => comment.parentId === null,
    )
    const repliesByParentId = new Map(
      topLevelComments.map((comment) => [
        String(comment._id),
        [] as typeof allComments,
      ]),
    )

    for (const comment of allComments) {
      if (!comment.parentId) {
        continue
      }

      const parentReplies = repliesByParentId.get(String(comment.parentId))
      if (parentReplies) {
        parentReplies.push(comment)
      }
    }

    const commentsWithReplies = topLevelComments.map((comment) => ({
      ...comment,
      replies: (repliesByParentId.get(String(comment._id)) ?? []).sort(
        (left, right) => left.createdAt - right.createdAt,
      ),
    }))

    if (args.sort === 'top') {
      return commentsWithReplies.sort(
        (left, right) => right.likesCount - left.likesCount,
      )
    }

    return commentsWithReplies.sort(
      (left, right) => right.createdAt - left.createdAt,
    )
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
    let projectTarget: Doc<'projects'> | null = null
    let updateTarget: Doc<'updates'> | null = null

    if (args.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', args.targetId)
      projectTarget = projectId ? await ctx.db.get(projectId) : null
    }

    if (args.targetType === 'update') {
      const updateId = ctx.db.normalizeId('updates', args.targetId)
      updateTarget = updateId ? await ctx.db.get(updateId) : null
    }

    if (!projectTarget && !updateTarget) {
      throw new ConvexError('Comment target not found')
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId)
      if (
        !parent ||
        parent.parentId ||
        parent.targetType !== args.targetType ||
        parent.targetId !== args.targetId
      ) {
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

    await ctx.db.patch(viewer._id, {
      stats: {
        ...viewer.stats,
        commentsCount: viewer.stats.commentsCount + 1,
      },
      updatedAt: Date.now(),
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
            target: buildProjectNotificationTarget(project.github.fullName, {
              commentId,
            }),
          })
        }

        const eventId = await ctx.db.insert('activity_events', {
          actorId: viewer._id,
          eventType: 'project_commented',
          projectId: project._id,
          updateId: null,
          commentId,
          actorSnapshot,
          projectSnapshot: buildProjectSnapshot(project),
          updateSnapshot: null,
          createdAt: Date.now(),
        })

        const event = await ctx.db.get(eventId)
        if (event) {
          await fanOutActivityEventToFollowers(ctx, event)
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
            target: buildProjectNotificationTarget(
              update.projectSnapshot.fullName,
              {
                commentId,
              },
            ),
          })
        }
      }
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId)
      if (parent) {
        const parentAuthor = await ctx.db.get(parent.authorId)
        if (parentAuthor) {
          const projectFullName =
            projectTarget?.github.fullName ??
            updateTarget?.projectSnapshot.fullName
          await createNotificationIfEnabled(ctx, {
            recipient: parentAuthor,
            actor: viewer,
            type: 'comment_replied',
            projectId: projectTarget?._id ?? updateTarget?.projectId ?? null,
            commentId,
            target: projectFullName
              ? buildProjectNotificationTarget(projectFullName, { commentId })
              : null,
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
    if (!comment || comment.authorId !== viewer._id || comment.isDeleted) {
      throw new ConvexError('Comment not found')
    }

    if (comment.parentId) {
      const parent = await ctx.db.get(comment.parentId)
      if (parent) {
        await ctx.db.patch(parent._id, {
          replyCount: Math.max(0, parent.replyCount - 1),
        })
      }
    }

    if (comment.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', comment.targetId)
      const project = projectId ? await ctx.db.get(projectId) : null
      if (project) {
        await ctx.db.patch(project._id, {
          locatic: {
            ...project.locatic,
            commentsCount: Math.max(0, project.locatic.commentsCount - 1),
          },
          updatedAt: Date.now(),
        })
      }
    } else {
      const updateId = ctx.db.normalizeId('updates', comment.targetId)
      const update = updateId ? await ctx.db.get(updateId) : null
      if (update) {
        await ctx.db.patch(update._id, {
          commentsCount: Math.max(0, update.commentsCount - 1),
        })
      }
    }

    await ctx.db.patch(comment._id, {
      content: '[deleted]',
      isDeleted: true,
    })

    await ctx.db.patch(viewer._id, {
      stats: {
        ...viewer.stats,
        commentsCount: Math.max(0, viewer.stats.commentsCount - 1),
      },
      updatedAt: Date.now(),
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
