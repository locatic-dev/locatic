import type { MutationCtx } from '../_generated/server'
import type { Doc } from './types'

async function insertHomeFeedItemIfMissing(
  ctx: MutationCtx,
  item: Omit<Doc<'home_feed_items'>, '_id' | '_creationTime'>,
) {
  const existing = await ctx.db
    .query('home_feed_items')
    .withIndex('by_user_dedupe', (query) =>
      query.eq('userId', item.userId).eq('dedupeKey', item.dedupeKey),
    )
    .unique()

  if (existing) {
    return existing._id
  }

  return await ctx.db.insert('home_feed_items', item)
}

export async function fanOutActivityEventToFollowers(
  ctx: MutationCtx,
  event: Doc<'activity_events'>,
) {
  const follows = await ctx.db
    .query('follows')
    .withIndex('by_following', (query) =>
      query.eq('followingId', event.actorId),
    )
    .collect()

  await Promise.all(
    follows
      .filter((follow) => follow.followerId !== event.actorId)
      .map((follow) =>
        insertHomeFeedItemIfMissing(ctx, {
          userId: follow.followerId,
          sourceEventId: event._id,
          dedupeKey: `${follow.followerId}:${event._id}`,
          reason: 'following',
          priority: 1,
          actorId: event.actorId,
          eventType: event.eventType,
          projectId: event.projectId,
          updateId: event.updateId,
          postId: event.postId ?? null,
          actorSnapshot: event.actorSnapshot,
          projectSnapshot: event.projectSnapshot,
          updateSnapshot: event.updateSnapshot,
          postSnapshot: event.postSnapshot ?? null,
          createdAt: event.createdAt,
        }),
      ),
  )
}

export async function backfillHomeFeedForFollow(
  ctx: MutationCtx,
  followerId: Doc<'users'>['_id'],
  followingId: Doc<'users'>['_id'],
) {
  const recentEvents = await ctx.db
    .query('activity_events')
    .withIndex('by_actor', (query) => query.eq('actorId', followingId))
    .collect()

  const sortedEvents = recentEvents
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 20)

  await Promise.all(
    sortedEvents.map((event) =>
      insertHomeFeedItemIfMissing(ctx, {
        userId: followerId,
        sourceEventId: event._id,
        dedupeKey: `${followerId}:${event._id}`,
        reason: 'following',
        priority: 2,
        actorId: event.actorId,
        eventType: event.eventType,
        projectId: event.projectId,
        updateId: event.updateId,
        postId: event.postId ?? null,
        actorSnapshot: event.actorSnapshot,
        projectSnapshot: event.projectSnapshot,
        updateSnapshot: event.updateSnapshot,
        postSnapshot: event.postSnapshot ?? null,
        createdAt: event.createdAt,
      }),
    ),
  )
}

export async function removeHomeFeedItemsForFollow(
  ctx: MutationCtx,
  followerId: Doc<'users'>['_id'],
  followingId: Doc<'users'>['_id'],
) {
  const feedItems = await ctx.db
    .query('home_feed_items')
    .withIndex('by_user_created', (query) => query.eq('userId', followerId))
    .collect()

  await Promise.all(
    feedItems
      .filter((item) => item.actorId === followingId)
      .map((item) => ctx.db.delete(item._id)),
  )
}
