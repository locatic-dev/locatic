import { v } from 'convex/values'

import { query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'

export const list = query({
  args: {
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const limit = Math.min(args.limit ?? 20, 50)

    const feedItems = await ctx.db
      .query('home_feed_items')
      .withIndex('by_user_created', (query) => query.eq('userId', viewer._id))
      .collect()

    const filtered = feedItems
      .filter((item) => (args.cursor ? item.createdAt < args.cursor : true))
      .sort((left, right) => right.createdAt - left.createdAt)

    return {
      items: filtered.slice(0, limit),
      nextCursor:
        filtered.length > limit
          ? (filtered[limit - 1]?.createdAt ?? null)
          : null,
    }
  },
})
