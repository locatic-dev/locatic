import { internalMutation } from './_generated/server'

export const runDailyCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const feedRetentionMs = 30 * 24 * 60 * 60 * 1000
    const notificationRetentionMs = 60 * 24 * 60 * 60 * 1000
    const activityRetentionMs = 90 * 24 * 60 * 60 * 1000

    const [feedItems, notifications, activities] = await Promise.all([
      ctx.db.query('home_feed_items').collect(),
      ctx.db.query('notifications').collect(),
      ctx.db.query('activity_events').collect(),
    ])

    const expiredFeedItems = feedItems.filter(
      (item) => now - item.createdAt > feedRetentionMs,
    )
    const expiredNotifications = notifications.filter(
      (item) => item.isRead && now - item.createdAt > notificationRetentionMs,
    )
    const expiredActivities = activities.filter(
      (item) => now - item.createdAt > activityRetentionMs,
    )

    await Promise.all([
      ...expiredFeedItems.map((item) => ctx.db.delete(item._id)),
      ...expiredNotifications.map((item) => ctx.db.delete(item._id)),
      ...expiredActivities.map((item) => ctx.db.delete(item._id)),
    ])

    return {
      deletedFeedItems: expiredFeedItems.length,
      deletedNotifications: expiredNotifications.length,
      deletedActivities: expiredActivities.length,
    }
  },
})
