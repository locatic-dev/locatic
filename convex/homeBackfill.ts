import { v } from 'convex/values'

import { internalMutation, type MutationCtx } from './_generated/server'
import {
  buildHomeFeedGroupKey,
  getHomeFeedLegacyTarget,
  upsertHomeFeedItemForEvent,
  type HomeFeedTarget,
} from './lib/homeFeed'
import type { Doc } from './lib/types'

const DEFAULT_BACKFILL_BATCH_SIZE = 50
const MAX_BACKFILL_BATCH_SIZE = 100
const COMMENT_ANCESTOR_LIMIT = 20

type ActivityEvent = Doc<'activity_events'>

function clampBatchSize(limit: number | undefined) {
  if (!limit) {
    return DEFAULT_BACKFILL_BATCH_SIZE
  }

  return Math.max(1, Math.min(MAX_BACKFILL_BATCH_SIZE, Math.floor(limit)))
}

async function buildCommentNavigationTarget(
  ctx: MutationCtx,
  comment: Doc<'comments'>,
) {
  const ancestorCommentIds: Array<Doc<'comments'>['_id']> = []
  let rootCommentId = comment._id
  let currentParentId = comment.parentId
  const seenParentIds = new Set<string>()

  while (currentParentId && seenParentIds.size < COMMENT_ANCESTOR_LIMIT) {
    const parentKey = String(currentParentId)
    if (seenParentIds.has(parentKey)) {
      break
    }

    seenParentIds.add(parentKey)
    const parent = await ctx.db.get(currentParentId)
    if (!parent) {
      break
    }

    ancestorCommentIds.unshift(currentParentId)
    rootCommentId = currentParentId
    currentParentId = parent.parentId
  }

  return {
    ancestorCommentIds,
    rootCommentId,
  }
}

function getCommentTargetLabel(event: ActivityEvent, comment: Doc<'comments'>) {
  if (comment.targetType === 'post') {
    return (
      event.projectSnapshot?.name ?? event.projectSnapshot?.fullName ?? 'post'
    )
  }

  return event.projectSnapshot?.fullName ?? 'project'
}

function buildNonCommentSnapshotTarget(
  event: ActivityEvent,
): HomeFeedTarget | null {
  if (!event.projectId || !event.projectSnapshot) {
    return null
  }

  if (event.eventType === 'post_commented' && event.postId) {
    return {
      kind: 'post',
      projectId: event.projectId,
      postId: event.postId,
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

export async function buildHomeFeedBackfillTarget(
  ctx: MutationCtx,
  event: ActivityEvent,
): Promise<HomeFeedTarget | null> {
  if (event.target) {
    return event.target
  }

  if (
    event.commentId &&
    (event.eventType === 'project_commented' ||
      event.eventType === 'post_commented') &&
    event.projectId &&
    event.projectSnapshot
  ) {
    const comment = await ctx.db.get(event.commentId)
    if (comment && !comment.isDeleted) {
      const navigationTarget = await buildCommentNavigationTarget(ctx, comment)
      const postId =
        event.postId ??
        (comment.targetType === 'post'
          ? (comment.targetId as Doc<'posts'>['_id'])
          : null)

      return {
        kind: 'comment',
        projectId: event.projectId,
        postId,
        commentId: event.commentId,
        ...navigationTarget,
        targetType: comment.targetType,
        content: comment.content.trim(),
        targetLabel: getCommentTargetLabel(event, comment),
        projectSnapshot: event.projectSnapshot,
        postSnapshot: event.postSnapshot ?? null,
      }
    }

    return buildNonCommentSnapshotTarget(event)
  }

  return getHomeFeedLegacyTarget(event)
}

export const backfillGroupedHomeFeedBatch = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = clampBatchSize(args.limit)
    const feedPage = await ctx.db
      .query('home_feed_items')
      .withIndex('by_created_at')
      .order('asc')
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      })

    let backfilled = 0
    let deletedLegacyRows = 0
    let merged = 0
    let skippedMissingEvent = 0
    let skippedMissingTarget = 0

    for (const item of feedPage.page) {
      if (item.groupKey && item.rowKind) {
        continue
      }

      const event = await ctx.db.get(item.sourceEventId)
      if (!event) {
        skippedMissingEvent += 1
        continue
      }

      const target = await buildHomeFeedBackfillTarget(ctx, event)
      if (!target) {
        skippedMissingTarget += 1
        continue
      }

      if (args.dryRun) {
        const groupKey = buildHomeFeedGroupKey(item.userId, event, target)
        const existing = await ctx.db
          .query('home_feed_items')
          .withIndex('by_user_group_key', (query) =>
            query.eq('userId', item.userId).eq('groupKey', groupKey),
          )
          .unique()

        if (existing) {
          merged += 1
        } else {
          backfilled += 1
        }

        continue
      }

      const result = await upsertHomeFeedItemForEvent(
        ctx,
        {
          userId: item.userId,
          sourceEventId: event._id,
          dedupeKey: `${item.userId}:${event._id}`,
          reason: item.reason,
          priority: item.priority,
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

      if (result.action === 'inserted') {
        backfilled += 1
      } else {
        merged += 1
      }

      await ctx.db.delete(item._id)
      deletedLegacyRows += 1
    }

    return {
      backfilled,
      continueCursor: feedPage.continueCursor,
      deletedLegacyRows,
      isDone: feedPage.isDone,
      merged,
      scanned: feedPage.page.length,
      skippedMissingEvent,
      skippedMissingTarget,
    }
  },
  returns: v.object({
    backfilled: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    deletedLegacyRows: v.number(),
    isDone: v.boolean(),
    merged: v.number(),
    scanned: v.number(),
    skippedMissingEvent: v.number(),
    skippedMissingTarget: v.number(),
  }),
})
