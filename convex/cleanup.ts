import { internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { deleteCleanupBatch, deleteMergedCleanupBatch } from './lib/cleanup'

const CLEANUP_BATCH_SIZE = 100

export const runDailyCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const feedRetentionMs = 30 * 24 * 60 * 60 * 1000
    const readNotificationRetentionMs = 7 * 24 * 60 * 60 * 1000
    const absoluteNotificationRetentionMs = 90 * 24 * 60 * 60 * 1000
    const activityRetentionMs = 90 * 24 * 60 * 60 * 1000

    const [feedItems, notifications, activities] = await Promise.all([
      deleteCleanupBatch({
        batchSize: CLEANUP_BATCH_SIZE,
        fetchBatch: () =>
          ctx.db
            .query('home_feed_items')
            .withIndex('by_created_at', (query) =>
              query.lt('createdAt', now - feedRetentionMs),
            )
            .take(CLEANUP_BATCH_SIZE),
        deleteBatch: (items) =>
          Promise.all(items.map((item) => ctx.db.delete(item._id))).then(
            () => undefined,
          ),
      }),
      deleteMergedCleanupBatch({
        batchSize: CLEANUP_BATCH_SIZE,
        fetchBatches: () =>
          Promise.all([
            ctx.db
              .query('notifications')
              .withIndex('by_read_created', (query) =>
                query
                  .eq('isRead', true)
                  .lt('createdAt', now - readNotificationRetentionMs),
              )
              .take(CLEANUP_BATCH_SIZE),
            ctx.db
              .query('notifications')
              .withIndex('by_created_at', (query) =>
                query.lt('createdAt', now - absoluteNotificationRetentionMs),
              )
              .take(CLEANUP_BATCH_SIZE),
          ]),
        getKey: (item) => String(item._id),
        deleteBatch: (items) =>
          Promise.all(items.map((item) => ctx.db.delete(item._id))).then(
            () => undefined,
          ),
      }),
      deleteCleanupBatch({
        batchSize: CLEANUP_BATCH_SIZE,
        fetchBatch: () =>
          ctx.db
            .query('activity_events')
            .withIndex('by_created_at', (query) =>
              query.lt('createdAt', now - activityRetentionMs),
            )
            .take(CLEANUP_BATCH_SIZE),
        deleteBatch: (items) =>
          Promise.all(items.map((item) => ctx.db.delete(item._id))).then(
            () => undefined,
          ),
      }),
    ])

    const purgeCandidates = await ctx.db
      .query('users')
      .withIndex('by_purge_after', (query) =>
        query.gt('purgeAfter', null).lt('purgeAfter', now),
      )
      .take(CLEANUP_BATCH_SIZE)
    const duePurgeUsers = purgeCandidates.filter(
      (user) => user.deletedAt && !user.purgedAt,
    )

    await Promise.all(
      duePurgeUsers.map((user) =>
        ctx.scheduler.runAfter(0, internal.users.purgeDeletedAccountIfDue, {
          userId: user._id,
        }),
      ),
    )

    const scheduledContinuation =
      feedItems.hasMore ||
      notifications.hasMore ||
      activities.hasMore ||
      purgeCandidates.length === CLEANUP_BATCH_SIZE

    if (scheduledContinuation) {
      await ctx.scheduler.runAfter(0, internal.cleanup.runDailyCleanup, {})
    }

    return {
      deletedFeedItems: feedItems.deletedCount,
      deletedNotifications: notifications.deletedCount,
      deletedActivities: activities.deletedCount,
      scheduledAccountPurges: duePurgeUsers.length,
      scheduledContinuation,
    }
  },
})
