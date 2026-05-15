import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

import { getViewerOrThrow } from './lib/auth'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    return await ctx.db
      .query('notifications')
      .withIndex('by_recipient_created', (query) =>
        query.eq('recipientId', viewer._id),
      )
      .collect()
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
