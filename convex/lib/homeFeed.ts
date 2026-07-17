import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import {
  HOME_FEED_EXPANDED_PREVIEW_LIMIT,
  HOME_FEED_GROUP_KIND_VALUES,
} from './constants'
import type { Doc } from './types'

export type HomeFeedTarget = NonNullable<Doc<'activity_events'>['target']>
type HomeFeedGroupKind = (typeof HOME_FEED_GROUP_KIND_VALUES)[number]
const HOME_FEED_SOURCE_EVENT_ID_LIMIT = 50
type FeedEventLike = Pick<
  Doc<'activity_events'>,
  'actorId' | 'createdAt' | 'eventType' | 'postId'
>
type LegacyFeedTargetInput = Pick<
  Doc<'activity_events'>,
  | 'eventType'
  | 'postId'
  | 'postSnapshot'
  | 'projectId'
  | 'projectSnapshot'
  | 'target'
> & {
  commentId?: Doc<'activity_events'>['commentId']
}
type HomeFeedItemInput = Omit<Doc<'home_feed_items'>, '_id' | '_creationTime'>

function getUtcDayBucket(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function getProjectTargetKey(target: HomeFeedTarget) {
  if ('projectId' in target) {
    return `project:${target.projectId}`
  }

  return null
}

export function getHomeFeedTargetKey(target: HomeFeedTarget) {
  switch (target.kind) {
    case 'project':
      return `project:${target.projectId}`
    case 'post':
      return `post:${target.postId}`
    case 'comment':
      return `comment:${target.commentId}`
    case 'profile':
      return `profile:${target.profile.userId}`
    case 'pull_request':
      return `pull_request:${target.projectId}:${target.number}`
  }
}

function getGroupTargetKey(event: FeedEventLike, target: HomeFeedTarget) {
  switch (event.eventType) {
    case 'project_commented':
    case 'post_created':
    case 'contributor_matched':
      return getProjectTargetKey(target)
    case 'post_commented':
      return event.postId ? `post:${event.postId}` : getProjectTargetKey(target)
    case 'project_liked':
    case 'project_posted':
    case 'followed':
      return null
  }
}

function getGroupKind(event: FeedEventLike): HomeFeedGroupKind {
  return event.eventType
}

export function buildHomeFeedGroupKey(
  userId: Id<'users'>,
  event: FeedEventLike,
  target: HomeFeedTarget,
) {
  const targetPart = getGroupTargetKey(event, target)
  const dayBucket = getUtcDayBucket(event.createdAt)
  return [
    userId,
    event.actorId,
    getGroupKind(event),
    dayBucket,
    targetPart ?? 'multi',
  ].join(':')
}

export function getHomeFeedLegacyTarget(
  event: LegacyFeedTargetInput,
): HomeFeedTarget | null {
  if (event.target) {
    return event.target
  }

  if (!event.projectId || !event.projectSnapshot) {
    return null
  }

  if (event.eventType === 'post_created' && event.postId) {
    return {
      kind: 'post',
      projectId: event.projectId,
      postId: event.postId,
      projectSnapshot: event.projectSnapshot,
      postSnapshot: event.postSnapshot ?? null,
    }
  }

  if (
    (event.eventType === 'project_commented' ||
      event.eventType === 'post_commented') &&
    event.commentId
  ) {
    return {
      kind: 'comment',
      projectId: event.projectId,
      postId: event.postId ?? null,
      commentId: event.commentId,
      targetType: event.eventType === 'post_commented' ? 'post' : 'project',
      content: '',
      targetLabel:
        event.eventType === 'post_commented'
          ? 'project update'
          : event.projectSnapshot.fullName,
      projectSnapshot: event.projectSnapshot,
      postSnapshot: event.postSnapshot ?? null,
    }
  }

  return {
    kind: 'project',
    projectId: event.projectId,
    projectSnapshot: event.projectSnapshot,
  }
}

export function appendHomeFeedPreviewTarget(
  current: HomeFeedTarget[],
  target: HomeFeedTarget,
) {
  const targetKey = getHomeFeedTargetKey(target)
  if (
    current.some(
      (previewTarget) => getHomeFeedTargetKey(previewTarget) === targetKey,
    )
  ) {
    return current
  }

  return [target, ...current].slice(0, HOME_FEED_EXPANDED_PREVIEW_LIMIT)
}

function appendSourceEventId(
  currentSourceEventIds: Id<'activity_events'>[],
  sourceEventId: Id<'activity_events'>,
) {
  return [...currentSourceEventIds, sourceEventId].slice(
    -HOME_FEED_SOURCE_EVENT_ID_LIMIT,
  )
}

export async function upsertHomeFeedItemForEvent(
  ctx: MutationCtx,
  item: HomeFeedItemInput,
  target: HomeFeedTarget,
) {
  const groupKey = buildHomeFeedGroupKey(item.userId, item, target)
  const existing = await ctx.db
    .query('home_feed_items')
    .withIndex('by_user_group_key', (query) =>
      query.eq('userId', item.userId).eq('groupKey', groupKey),
    )
    .unique()

  if (
    existing?.sourceEventId === item.sourceEventId ||
    existing?.sourceEventIds?.some((eventId) => eventId === item.sourceEventId)
  ) {
    return {
      action: 'deduped' as const,
      id: existing._id,
    }
  }

  if (existing) {
    const currentSourceEventIds = existing.sourceEventIds ?? [
      existing.sourceEventId,
    ]
    const nextEventCount = (existing.eventCount ?? 1) + 1
    const nextPreviewTargets = appendHomeFeedPreviewTarget(
      existing.previewTargets ?? (existing.target ? [existing.target] : []),
      target,
    )

    await ctx.db.patch(existing._id, {
      sourceEventId: item.sourceEventId,
      eventType: item.eventType,
      postId: item.postId ?? existing.postId ?? null,
      rowKind: nextEventCount > 1 ? 'event_group' : 'single_event',
      eventCount: nextEventCount,
      firstEventAt: Math.min(
        existing.firstEventAt ?? existing.createdAt,
        item.createdAt,
      ),
      latestEventAt: Math.max(
        existing.latestEventAt ?? existing.createdAt,
        item.createdAt,
      ),
      sourceEventIds: appendSourceEventId(
        currentSourceEventIds,
        item.sourceEventId,
      ),
      previewTargets: nextPreviewTargets,
      target: existing.target ?? target,
      createdAt: Math.max(existing.createdAt, item.createdAt),
    })

    return {
      action: 'merged' as const,
      id: existing._id,
    }
  }

  const id = await ctx.db.insert('home_feed_items', {
    ...item,
    dedupeKey: groupKey,
    rowKind: 'single_event',
    groupKey,
    groupKind: getGroupKind(item),
    eventCount: 1,
    firstEventAt: item.createdAt,
    latestEventAt: item.createdAt,
    sourceEventIds: [item.sourceEventId],
    previewTargets: [target],
    target,
  })

  return {
    action: 'inserted' as const,
    id,
  }
}

export async function enqueueActivityEventFanOut(
  ctx: MutationCtx,
  eventId: Id<'activity_events'>,
) {
  await ctx.scheduler.runAfter(0, internal.home.fanOutActivityEventBatch, {
    eventId,
    cursor: null,
  })
}

export async function fanOutActivityEventToFollowersPage(
  ctx: MutationCtx,
  event: Doc<'activity_events'>,
  cursor: string | null,
) {
  const target = getHomeFeedLegacyTarget(event)
  if (!target) {
    return { continueCursor: null, isDone: true }
  }

  const followsPage = await ctx.db
    .query('follows')
    .withIndex('by_following', (query) =>
      query.eq('followingId', event.actorId),
    )
    .paginate({
      cursor,
      numItems: 100,
      maximumRowsRead: 100,
      maximumBytesRead: 2_000_000,
    })

  await Promise.all(
    followsPage.page
      .filter((follow) => follow.followerId !== event.actorId)
      .map((follow) =>
        upsertHomeFeedItemForEvent(
          ctx,
          {
            userId: follow.followerId,
            sourceEventId: event._id,
            dedupeKey: `${follow.followerId}:${event._id}`,
            reason: 'following',
            priority: 1,
            actorId: event.actorId,
            eventType: event.eventType,
            projectId: event.projectId ?? null,
            postId: event.postId ?? null,
            actorSnapshot: event.actorSnapshot,
            projectSnapshot: event.projectSnapshot ?? null,
            postSnapshot: event.postSnapshot ?? null,
            target,
            createdAt: event.createdAt,
          },
          target,
        ),
      ),
  )

  return {
    continueCursor: followsPage.isDone ? null : followsPage.continueCursor,
    isDone: followsPage.isDone,
  }
}

export async function backfillHomeFeedForFollow(
  ctx: MutationCtx,
  followerId: Doc<'users'>['_id'],
  followingId: Doc<'users'>['_id'],
) {
  const recentEvents = await ctx.db
    .query('activity_events')
    .withIndex('by_actor_created_at', (query) =>
      query.eq('actorId', followingId),
    )
    .order('desc')
    .take(20)

  await Promise.all(
    recentEvents.map((event) => {
      const target = getHomeFeedLegacyTarget(event)
      if (!target) {
        return Promise.resolve(null)
      }

      return upsertHomeFeedItemForEvent(
        ctx,
        {
          userId: followerId,
          sourceEventId: event._id,
          dedupeKey: `${followerId}:${event._id}`,
          reason: 'following',
          priority: 2,
          actorId: event.actorId,
          eventType: event.eventType,
          projectId: event.projectId ?? null,
          postId: event.postId ?? null,
          actorSnapshot: event.actorSnapshot,
          projectSnapshot: event.projectSnapshot ?? null,
          postSnapshot: event.postSnapshot ?? null,
          target,
          createdAt: event.createdAt,
        },
        target,
      )
    }),
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
