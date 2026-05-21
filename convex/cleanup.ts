import { internalMutation } from './_generated/server'
import { deleteCleanupBatches, deleteMergedCleanupBatches } from './lib/cleanup'

const CLEANUP_BATCH_SIZE = 100

export const runDailyCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const feedRetentionMs = 30 * 24 * 60 * 60 * 1000
    const readNotificationRetentionMs = 7 * 24 * 60 * 60 * 1000
    const absoluteNotificationRetentionMs = 90 * 24 * 60 * 60 * 1000
    const activityRetentionMs = 90 * 24 * 60 * 60 * 1000

    const [deletedFeedItems, deletedNotifications, deletedActivities] =
      await Promise.all([
        deleteCleanupBatches({
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
        deleteMergedCleanupBatches({
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
        deleteCleanupBatches({
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

    return {
      deletedFeedItems,
      deletedNotifications,
      deletedActivities,
    }
  },
})
