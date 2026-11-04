import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { getViewerOrThrow } from './lib/auth'
import { enforceRateLimit } from './lib/rate_limits'
import {
  backfillHomeFeedForFollow,
  enqueueActivityEventFanOut,
  scheduleHomeFeedRemovalForUnfollow,
} from './lib/homeFeed'
import {
  buildProfileNotificationTarget,
  createNotificationIfEnabled,
} from './lib/notifications'
import { buildActorSnapshot, buildProfileTargetSnapshot } from './lib/snapshots'
import { countMetric } from './metrics'

const followValidator = v.object({
  _id: v.id('follows'),
  _creationTime: v.number(),
  followerId: v.id('users'),
  followingId: v.id('users'),
  createdAt: v.number(),
})

// Raw relationship rows are viewer-only. Public graph reads use
// users.publicFollowGraphPage and its privacy-filtered profile projections.
async function getOwnFollowGraphViewerId(ctx: QueryCtx, userId: Id<'users'>) {
  const viewer = await getViewerOrThrow(ctx)
  if (
    viewer._id !== userId ||
    viewer.deletedAt != null ||
    viewer.purgedAt != null
  ) {
    throw new ConvexError('Unauthorized')
  }
  return viewer._id
}

export const listFollowers = query({
  args: {
    userId: v.id('users'),
  },
  returns: v.array(followValidator),
  handler: async (ctx, args) => {
    const viewerId = await getOwnFollowGraphViewerId(ctx, args.userId)
    return await ctx.db
      .query('follows')
      .withIndex('by_following', (query) => query.eq('followingId', viewerId))
      .collect()
  },
})

export const listFollowing = query({
  args: {
    userId: v.id('users'),
  },
  returns: v.array(followValidator),
  handler: async (ctx, args) => {
    const viewerId = await getOwnFollowGraphViewerId(ctx, args.userId)
    return await ctx.db
      .query('follows')
      .withIndex('by_follower', (query) => query.eq('followerId', viewerId))
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
    if (
      !targetUser ||
      targetUser.deletedAt != null ||
      targetUser.deactivatedAt != null ||
      targetUser.purgedAt != null
    ) {
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

    await enforceRateLimit(ctx, 'followWrite', String(viewer._id))
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

    await backfillHomeFeedForFollow(ctx, viewer._id, targetUser._id, Date.now())

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

    await countMetric(ctx, 'follow')
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

    await scheduleHomeFeedRemovalForUnfollow(ctx, viewer._id, targetUser._id)
    return null
  },
})
