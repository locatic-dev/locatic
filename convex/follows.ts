import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import {
  backfillHomeFeedForFollow,
  enqueueActivityEventFanOut,
  removeHomeFeedItemsForFollow,
} from './lib/homeFeed'
import {
  buildProfileNotificationTarget,
  createNotificationIfEnabled,
} from './lib/notifications'
import { buildActorSnapshot, buildProfileTargetSnapshot } from './lib/snapshots'

export const listFollowers = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('follows')
      .withIndex('by_following', (query) =>
        query.eq('followingId', args.userId),
      )
      .collect()
  },
})

export const listFollowing = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('follows')
      .withIndex('by_follower', (query) => query.eq('followerId', args.userId))
      .collect()
  },
})

export const follow = mutation({
  args: {
    targetUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    if (viewer._id === args.targetUserId) {
      throw new ConvexError('You cannot follow yourself')
    }

    const targetUser = await ctx.db.get(args.targetUserId)
    if (!targetUser) {
      throw new ConvexError('User not found')
    }

    const existing = await ctx.db
      .query('follows')
      .withIndex('by_pair', (query) =>
        query.eq('followerId', viewer._id).eq('followingId', args.targetUserId),
      )
      .unique()

    if (existing) {
      return existing
    }

    const followId = await ctx.db.insert('follows', {
      followerId: viewer._id,
      followingId: args.targetUserId,
      createdAt: Date.now(),
    })

    await ctx.db.patch(viewer._id, {
      stats: {
        ...viewer.stats,
        followingCount: viewer.stats.followingCount + 1,
      },
      updatedAt: Date.now(),
    })

    await ctx.db.patch(targetUser._id, {
      stats: {
        ...targetUser.stats,
        followersCount: targetUser.stats.followersCount + 1,
      },
      updatedAt: Date.now(),
    })

    await backfillHomeFeedForFollow(ctx, viewer._id, targetUser._id)

    const targetSnapshot = await buildActorSnapshot(ctx.db, targetUser)
    const eventId = await ctx.db.insert('activity_events', {
      actorId: viewer._id,
      eventType: 'followed',
      projectId: null,
      postId: null,
      commentId: null,
      actorSnapshot: await buildActorSnapshot(ctx.db, viewer),
      projectSnapshot: null,
      postSnapshot: null,
      target: {
        kind: 'profile',
        profile: buildProfileTargetSnapshot(
          targetUser,
          targetSnapshot.cityName,
        ),
      },
      createdAt: Date.now(),
    })

    await enqueueActivityEventFanOut(ctx, eventId)

    await createNotificationIfEnabled(ctx, {
      recipient: targetUser,
      actor: viewer,
      type: 'followed',
      target: buildProfileNotificationTarget(viewer.github.username),
    })

    return await ctx.db.get(followId)
  },
})

export const unfollow = mutation({
  args: {
    targetUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const targetUser = await ctx.db.get(args.targetUserId)
    if (!targetUser) {
      throw new ConvexError('User not found')
    }

    const existing = await ctx.db
      .query('follows')
      .withIndex('by_pair', (query) =>
        query.eq('followerId', viewer._id).eq('followingId', args.targetUserId),
      )
      .unique()

    if (!existing) {
      return null
    }

    await ctx.db.delete(existing._id)

    await ctx.db.patch(viewer._id, {
      stats: {
        ...viewer.stats,
        followingCount: Math.max(0, viewer.stats.followingCount - 1),
      },
      updatedAt: Date.now(),
    })

    await ctx.db.patch(targetUser._id, {
      stats: {
        ...targetUser.stats,
        followersCount: Math.max(0, targetUser.stats.followersCount - 1),
      },
      updatedAt: Date.now(),
    })

    await removeHomeFeedItemsForFollow(ctx, viewer._id, targetUser._id)
    return null
  },
})
