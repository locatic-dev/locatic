import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import {
  HOME_FEED_EXPANDED_PREVIEW_LIMIT,
  HOME_FEED_GROUP_KIND_VALUES,
} from './constants'
import type { Doc } from './types'
import {
  isAccountDeleted,
  isAccountPastRestorationWindow,
} from './account_deletion'

export type HomeFeedTarget = NonNullable<Doc<'activity_events'>['target']>
type HomeFeedGroupKind = (typeof HOME_FEED_GROUP_KIND_VALUES)[number]
const HOME_FEED_SOURCE_EVENT_ID_LIMIT = 50
const HOME_FEED_BACKFILL_LIMIT = 20

/**
 * The one Home time boundary: follow backfill copies only events newer than
 * this, `home.list` reads only items newer than this, and the daily cleanup
 * deletes items older than this. Keeping all three on one constant means an
 * item is never shown that the next cleanup would delete. Source
 * `activity_events` keep their own, longer retention (see `cleanup.ts`).
 */
export const HOME_FEED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Oldest `createdAt` (inclusive) that belongs in a Home feed at `now`. */
export function getHomeFeedCutoff(now: number) {
  return now - HOME_FEED_RETENTION_MS
}
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
  const [recipient, actor] = await Promise.all([
    ctx.db.get(item.userId),
    ctx.db.get(item.actorId),
  ])
  if (
    !recipient ||
    !actor ||
    isAccountDeleted(recipient) ||
    isAccountDeleted(actor) ||
    actor.deactivatedAt != null
  ) {
    return { action: 'skipped' as const, id: null }
  }
  if ('projectId' in target) {
    const project = await ctx.db.get(target.projectId)
    const owner = project ? await ctx.db.get(project.ownerId) : null
    if (!owner || isAccountDeleted(owner) || owner.deactivatedAt != null)
      return { action: 'skipped' as const, id: null }
  } else if (target.kind === 'profile') {
    const profile = await ctx.db.get(target.profile.userId)
    if (!profile || isAccountDeleted(profile) || profile.deactivatedAt != null)
      return { action: 'skipped' as const, id: null }
  }
  if ('postId' in target && target.postId) {
    const post = await ctx.db.get(target.postId)
    if (post) {
      const author = await ctx.db.get(post.actorId)
      if (!author || isAccountPastRestorationWindow(author, Date.now()))
        return { action: 'skipped' as const, id: null }
    }
  }
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

/**
 * Copies the followed user's latest events inside the Home boundary into the
 * follower's feed. Events older than `HOME_FEED_RETENTION_MS` are skipped so a
 * new follow never surfaces activity that the next cleanup would delete.
 */
export async function backfillHomeFeedForFollow(
  ctx: MutationCtx,
  followerId: Doc<'users'>['_id'],
  followingId: Doc<'users'>['_id'],
  now: number,
) {
  const recentEvents = await ctx.db
    .query('activity_events')
    .withIndex('by_actor_created_at', (query) =>
      query.eq('actorId', followingId).gte('createdAt', getHomeFeedCutoff(now)),
    )
    .order('desc')
    .take(HOME_FEED_BACKFILL_LIMIT)

  // Sequential on purpose: these events share one follower, so several of
  // them can land in the same group row, and `upsertHomeFeedItemForEvent`
  // reads the group before it inserts. Run concurrently, two same-group
  // events would both miss the row and insert duplicates, and every later
  // `.unique()` on that group would throw. Oldest first, as live fan-out
  // would have delivered them, so merged rows end with the newest event and
  // preview. At most `HOME_FEED_BACKFILL_LIMIT` (20) events.
  for (const event of [...recentEvents].reverse()) {
    const target = getHomeFeedLegacyTarget(event)
    if (!target) {
      continue
    }

    await upsertHomeFeedItemForEvent(
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
  }
}

/** Feed rows deleted per unfollow cleanup transaction. */
export const HOME_FEED_UNFOLLOW_BATCH_SIZE = 100

/**
 * Schedules removal of the follower's feed rows from an actor they no longer
 * follow. `home.list` already hides those rows, so the unfollow itself never
 * reads the feed.
 */
export async function scheduleHomeFeedRemovalForUnfollow(
  ctx: MutationCtx,
  followerId: Id<'users'>,
  actorId: Id<'users'>,
) {
  await ctx.scheduler.runAfter(
    0,
    internal.home.removeUnfollowedFeedItemsBatch,
    {
      followerId,
      actorId,
    },
  )
}

/**
 * Deletes one batch of the follower's feed rows from `actorId`. Each batch
 * first re-checks the follow: once the follower follows the actor again, the
 * rows belong to the new follow and the job stops without deleting.
 */
export async function removeHomeFeedItemsForUnfollowBatch(
  ctx: MutationCtx,
  followerId: Id<'users'>,
  actorId: Id<'users'>,
) {
  const follow = await ctx.db
    .query('follows')
    .withIndex('by_pair', (query) =>
      query.eq('followerId', followerId).eq('followingId', actorId),
    )
    .first()
  if (follow) {
    return { deletedCount: 0, isDone: true }
  }

  const feedItems = await ctx.db
    .query('home_feed_items')
    .withIndex('by_user_actor_created', (query) =>
      query.eq('userId', followerId).eq('actorId', actorId),
    )
    .take(HOME_FEED_UNFOLLOW_BATCH_SIZE)

  for (const item of feedItems) {
    await ctx.db.delete(item._id)
  }

  return {
    deletedCount: feedItems.length,
    isDone: feedItems.length < HOME_FEED_UNFOLLOW_BATCH_SIZE,
  }
}
