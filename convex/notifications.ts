import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'

import { internal } from './_generated/api'
import { getViewerOrThrow } from './lib/auth'
import type { Id } from './_generated/dataModel'
import { buildConversationKey } from './lib/conversation'
import {
  buildConversationNotificationTarget,
  buildProfileNotificationTarget,
  buildProjectNotificationTarget,
} from './lib/notifications'
import { resolveProjectOwnerLogin } from './lib/project_route'

type NotificationTargetRecord = {
  kind: 'profile' | 'project' | 'conversation'
  username: string | null
  projectFullName: string | null
  projectOwner?: string | null
  projectRepo?: string | null
  conversationId: Id<'conversations'> | null
  inboxTab?: 'inbox' | 'requests' | null
  commentId: Id<'comments'> | null
}

type ProjectNotificationRouteTarget = {
  fullName: string
  owner: string
  repo: string
}

async function resolveNotificationTarget(
  ctx: QueryCtx,
  notification: {
    target?: NotificationTargetRecord
    type: string
    actorId: Id<'users'>
    recipientId: Id<'users'>
    projectId: Id<'projects'> | null
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

  let projectTarget: ProjectNotificationRouteTarget | null = null

  if (notification.projectId) {
    const project = await ctx.db.get(notification.projectId)
    projectTarget = project
      ? {
          fullName: project.github.fullName,
          owner: resolveProjectOwnerLogin(project),
          repo: project.github.name,
        }
      : null
  }

  if (!projectTarget && notification.commentId) {
    const comment = await ctx.db.get(notification.commentId)
    if (comment?.targetType === 'project') {
      const projectId = ctx.db.normalizeId('projects', comment.targetId)
      const project = projectId ? await ctx.db.get(projectId) : null
      projectTarget = project
        ? {
            fullName: project.github.fullName,
            owner: resolveProjectOwnerLogin(project),
            repo: project.github.name,
          }
        : null
    }
  }

  return projectTarget
    ? buildProjectNotificationTarget(projectTarget, {
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

/**
 * Highest unread count the badge query reads. The badge shows "99+" above
 * 99, so reading one past that is enough and keeps the read bounded.
 */
const UNREAD_COUNT_CAP = 100

/**
 * Batch size for the one-off `backfillTargets` migration. Each run reads one
 * page and schedules the next.
 */
const BACKFILL_BATCH_SIZE = 200

/**
 * The viewer's notifications, newest first: one `.paginate()` per execution.
 *
 * Read-only: rows written before `target` existed get their destination
 * resolved here at read time. Storing it is the job of the one-off
 * `internal.notifications.backfillTargets` migration, never of a page view.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const notificationsPage = await ctx.db
      .query('notifications')
      .withIndex('by_recipient_created', (query) =>
        query.eq('recipientId', viewer._id),
      )
      .order('desc')
      .paginate(args.paginationOpts)

    const page = await Promise.all(
      notificationsPage.page.map(async (notification) => {
        const resolvedTarget = notification.target
          ? await normalizeNotificationTarget(ctx, notification.target)
          : await resolveNotificationTarget(ctx, notification)

        return {
          ...notification,
          target: resolvedTarget,
        }
      }),
    )

    return {
      ...notificationsPage,
      page,
    }
  },
})

/**
 * One-off migration: stores the resolved `target` (and the inbox tab of
 * conversation targets) on notifications written before those fields existed.
 * It walks the whole table one page per run and schedules itself until done.
 * Humans run it once per deployment:
 *
 *   npx convex run notifications:backfillTargets '{}'
 */
export const backfillTargets = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ patchedCount: v.number(), isDone: v.boolean() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ patchedCount: number; isDone: boolean }> => {
    const notificationsPage = await ctx.db
      .query('notifications')
      .withIndex('by_created_at')
      .paginate({
        cursor: args.cursor ?? null,
        numItems: BACKFILL_BATCH_SIZE,
      })

    let patchedCount = 0

    for (const notification of notificationsPage.page) {
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

    if (!notificationsPage.isDone) {
      await ctx.scheduler.runAfter(0, internal.notifications.backfillTargets, {
        cursor: notificationsPage.continueCursor,
      })
    }

    return { patchedCount, isDone: notificationsPage.isDone }
  },
})

/**
 * The notifications badge: the viewer's unread notifications, capped at
 * `UNREAD_COUNT_CAP`. The sidebar, the mobile tab bar and the notifications
 * page header all read this one query.
 *
 * `dm_received` never counts: a direct message is already counted by the
 * inbox badge (`users.unreadMessagesCount`), so its notification is created
 * read (`createNotificationIfEnabled`) and one message is never two tasks.
 * The type filter only skips unread `dm_received` rows written before that
 * change; there is a bounded number of them and retention deletes them.
 */
export const unreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_recipient_read', (query) =>
        query.eq('recipientId', viewer._id).eq('isRead', false),
      )
      .filter((query) => query.neq(query.field('type'), 'dm_received'))
      .take(UNREAD_COUNT_CAP)

    return unread.length
  },
})

/** Marks one notification read. Called only from an explicit row click. */
export const markRead = mutation({
  args: {
    notificationId: v.id('notifications'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const notification = await ctx.db.get(args.notificationId)
    if (!notification || notification.recipientId !== viewer._id) {
      return null
    }

    if (!notification.isRead) {
      await ctx.db.patch(notification._id, {
        isRead: true,
      })
    }

    return null
  },
})

/** Marks every unread notification read. Called only from "mark all read". */
export const markAllRead = mutation({
  args: {},
  returns: v.null(),
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
