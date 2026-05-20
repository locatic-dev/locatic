import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { v } from 'convex/values'

import { getViewerOrThrow } from './lib/auth'
import type { Id } from './_generated/dataModel'
import { buildConversationKey } from './lib/conversation'
import {
  buildConversationNotificationTarget,
  buildProfileNotificationTarget,
  buildProjectNotificationTarget,
} from './lib/notifications'

type NotificationTargetRecord = {
  kind: 'profile' | 'project' | 'conversation'
  username: string | null
  projectFullName: string | null
  conversationId: Id<'conversations'> | null
  inboxTab?: 'inbox' | 'requests' | null
  commentId: Id<'comments'> | null
}

async function resolveNotificationTarget(
  ctx: QueryCtx,
  notification: {
    target?: NotificationTargetRecord
    type: string
    actorId: Id<'users'>
    recipientId: Id<'users'>
    projectId: Id<'projects'> | null
    updateId: Id<'updates'> | null
    commentId: Id<'comments'> | null
  },
) {
  if (notification.target) {
    return notification.target
  }

  if (notification.type === 'followed') {
    const actor = await ctx.db.get(notification.actorId)
    return actor ? buildProfileNotificationTarget(actor.github.username) : null
  }

  if (notification.type === 'dm_received') {
    const key = buildConversationKey(
      String(notification.actorId),
      String(notification.recipientId),
    )
    const conversation = await ctx.db
      .query('conversations')
      .withIndex('by_conversation_key', (query) =>
        query.eq('conversationKey', key),
      )
      .unique()

    return conversation
      ? buildConversationNotificationTarget(
          conversation._id,
          conversation.isRequest,
        )
      : null
  }

  let projectFullName: string | null = null

  if (notification.projectId) {
    const project = await ctx.db.get(notification.projectId)
    projectFullName = project?.github.fullName ?? null
  }

  if (!projectFullName && notification.updateId) {
    const update = await ctx.db.get(notification.updateId)
    projectFullName = update?.projectSnapshot.fullName ?? null
  }

  if (!projectFullName && notification.commentId) {
    const comment = await ctx.db.get(notification.commentId)
    if (comment?.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', comment.targetId)
      const project = projectId ? await ctx.db.get(projectId) : null
      projectFullName = project?.github.fullName ?? null
    }
    if (comment?.targetType === 'update') {
      const updateId = ctx.db.normalizeId('updates', comment.targetId)
      const update = updateId ? await ctx.db.get(updateId) : null
      projectFullName = update?.projectSnapshot.fullName ?? null
    }
  }

  return projectFullName
    ? buildProjectNotificationTarget(projectFullName, {
        commentId: notification.commentId,
      })
    : null
}

async function normalizeNotificationTarget(
  ctx: QueryCtx | MutationCtx,
  target: NotificationTargetRecord,
): Promise<
  Required<Pick<NotificationTargetRecord, 'inboxTab'>> &
    Omit<NotificationTargetRecord, 'inboxTab'>
> {
  if (target.kind !== 'conversation') {
    return {
      ...target,
      inboxTab: target.inboxTab ?? null,
    }
  }

  if (target.inboxTab !== undefined) {
    return {
      ...target,
      inboxTab: target.inboxTab,
    }
  }

  const conversation = target.conversationId
    ? await ctx.db.get(target.conversationId)
    : null
  const inboxTab: 'inbox' | 'requests' | null = conversation
    ? conversation.isRequest
      ? 'requests'
      : 'inbox'
    : null

  return {
    ...target,
    inboxTab,
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_recipient_created', (query) =>
        query.eq('recipientId', viewer._id),
      )
      .collect()

    return await Promise.all(
      notifications.map(async (notification) => {
        const resolvedTarget = notification.target
          ? await normalizeNotificationTarget(ctx, notification.target)
          : await resolveNotificationTarget(ctx, notification)

        return {
          ...notification,
          target: resolvedTarget,
        }
      }),
    )
  },
})

export const backfillTargets = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_recipient_created', (query) =>
        query.eq('recipientId', viewer._id),
      )
      .collect()

    let patchedCount = 0

    for (const notification of notifications) {
      if (notification.target && notification.target.inboxTab !== undefined) {
        continue
      }

      const target = notification.target
        ? await normalizeNotificationTarget(ctx, notification.target)
        : await resolveNotificationTarget(ctx, notification)
      if (!target) {
        continue
      }

      await ctx.db.patch(notification._id, { target })
      patchedCount += 1
    }

    return { patchedCount }
  },
})

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_recipient_read', (query) =>
        query.eq('recipientId', viewer._id).eq('isRead', false),
      )
      .collect()

    return unread.length
  },
})

export const markRead = mutation({
  args: {
    notificationId: v.id('notifications'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const notification = await ctx.db.get(args.notificationId)
    if (!notification || notification.recipientId !== viewer._id) {
      return null
    }

    await ctx.db.patch(notification._id, {
      isRead: true,
    })

    return null
  },
})

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const unreadNotifications = await ctx.db
      .query('notifications')
      .withIndex('by_recipient_read', (query) =>
        query.eq('recipientId', viewer._id).eq('isRead', false),
      )
      .collect()

    await Promise.all(
      unreadNotifications.map((notification) =>
        ctx.db.patch(notification._id, { isRead: true }),
      ),
    )

    return null
  },
})
