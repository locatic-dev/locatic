import type { NamedTableInfo, OrderedQuery } from 'convex/server'
import type { DataModel, Doc, Id, TableNames } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { createDefaultViewerProfile } from './viewer'
import { createCityStatsChanges } from './cityStats'
import { buildProjectExploreOwner } from './snapshots'
import {
  getNextCommentReactionState,
  getNextPostReactionCounts,
  getNextProjectReactionLocatic,
} from './reactions'

// Historical snapshot tables have no complete account index. Sweep those in
// bounded pages as well as account-owned tables; keep projects/posts until
// references to their identity have been removed.
const PURGE_TABLES = [
  'comments',
  'reactions',
  'follows',
  'notifications',
  'messages',
  'conversations',
  'activity_events',
  'home_feed_items',
  'pulse_snapshots',
  'project_contributors',
  'reports',
  'saved_projects',
  'github_tokens',
  'github_sync_log',
  'explore_history',
  'explore_post_history',
  'email_sends',
  'email_preference_changes',
  'project_releases',
  'posts',
  'projects',
] as const
const PURGE_PAGE_SIZE = 25

const erasedActor = {
  displayName: 'Deleted User',
  avatarUrl: '',
  cityId: null,
  cityName: null,
}
const erasedProject = {
  name: 'deleted-project',
  fullName: 'deleted/deleted-project',
  ownerLogin: 'deleted',
  primaryLanguage: null,
  languages: [],
}
const erasedTarget = {
  projectFullName: 'deleted/deleted-project',
  projectOwner: 'deleted',
  projectRepo: 'deleted-project',
  targetLabel: 'deleted project',
  updateTitle: null,
}

async function ownedProject(
  ctx: MutationCtx,
  id: Id<'projects'>,
  userId: Id<'users'>,
) {
  return (await ctx.db.get(id))?.ownerId === userId
}

/** Derived snapshots are disposable; independently authored primary text is not. */
async function referencesErasedIdentity(
  ctx: MutationCtx,
  value: unknown,
  userId: Id<'users'>,
): Promise<boolean> {
  if (value === userId) return true
  if (Array.isArray(value)) {
    for (const item of value)
      if (await referencesErasedIdentity(ctx, item, userId)) return true
    return false
  }
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === 'string') {
      if (
        key === 'projectId' ||
        (key === 'targetId' && record.targetType === 'project')
      ) {
        const id = ctx.db.normalizeId('projects', child)
        if (id && (await ownedProject(ctx, id, userId))) return true
      }
      if (
        key === 'postId' ||
        (key === 'targetId' && record.targetType === 'post')
      ) {
        const id = ctx.db.normalizeId('posts', child)
        const post = id ? await ctx.db.get(id) : null
        if (post && (post.actorId === userId || post.ownerId === userId))
          return true
      }
      if (key === 'commentId') {
        const id = ctx.db.normalizeId('comments', child)
        if (id && (await ctx.db.get(id))?.authorId === userId) return true
      }
    }
    if (await referencesErasedIdentity(ctx, child, userId)) return true
  }
  return false
}

async function decrementStat(
  ctx: MutationCtx,
  id: Id<'users'>,
  key:
    | 'followersCount'
    | 'followingCount'
    | 'contributionsCount'
    | 'likedCount',
  amount = 1,
) {
  const user = await ctx.db.get(id)
  if (user)
    await ctx.db.patch(id, {
      stats: { ...user.stats, [key]: Math.max(0, user.stats[key] - amount) },
    })
}

async function visitPage<T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  cursor: string | null,
  visit: (row: Doc<T>) => Promise<void>,
  query: OrderedQuery<NamedTableInfo<DataModel, T>> = ctx.db.query(table),
) {
  const page = await query.paginate({
    cursor,
    numItems: PURGE_PAGE_SIZE,
    maximumRowsRead: PURGE_PAGE_SIZE,
    maximumBytesRead: 256_000,
  })
  for (const row of page.page) await visit(row)
  return { isDone: page.isDone, cursor: page.continueCursor }
}

async function removeReaction(ctx: MutationCtx, reaction: Doc<'reactions'>) {
  if (reaction.targetType === 'project') {
    const id = ctx.db.normalizeId('projects', reaction.targetId)
    const project = id ? await ctx.db.get(id) : null
    if (project)
      await ctx.db.patch(project._id, {
        locatic: getNextProjectReactionLocatic(
          project,
          reaction.reactionType,
          -1,
        ),
        updatedAt: Date.now(),
      })
    if (reaction.reactionType === 'like')
      await decrementStat(ctx, reaction.userId, 'likedCount')
  } else if (reaction.targetType === 'post') {
    const id = ctx.db.normalizeId('posts', reaction.targetId)
    const post = id ? await ctx.db.get(id) : null
    if (post)
      await ctx.db.patch(post._id, {
        reactionCounts: getNextPostReactionCounts(
          post,
          reaction.reactionType,
          -1,
        ),
      })
  } else {
    const id = ctx.db.normalizeId('comments', reaction.targetId)
    const comment = id ? await ctx.db.get(id) : null
    if (comment)
      await ctx.db.patch(
        comment._id,
        getNextCommentReactionState(
          {
            likesCount: comment.likesCount,
            reactionCounts: comment.reactionCounts,
          },
          reaction.reactionType,
          -1,
        ),
      )
  }
  await ctx.db.delete(reaction._id)
}

async function scrubComment(
  ctx: MutationCtx,
  row: Doc<'comments'>,
  userId: Id<'users'>,
) {
  if (row.authorId === userId) {
    if (!row.isDeleted) {
      if (row.parentId) {
        const parent = await ctx.db.get(row.parentId)
        if (parent)
          await ctx.db.patch(parent._id, {
            replyCount: Math.max(0, parent.replyCount - 1),
          })
      }
      if (row.targetType === 'project') {
        const id = ctx.db.normalizeId('projects', row.targetId)
        const project = id ? await ctx.db.get(id) : null
        if (project)
          await ctx.db.patch(project._id, {
            locatic: {
              ...project.locatic,
              commentsCount: Math.max(0, project.locatic.commentsCount - 1),
            },
          })
      } else {
        const id = ctx.db.normalizeId('posts', row.targetId)
        const post = id ? await ctx.db.get(id) : null
        if (post)
          await ctx.db.patch(post._id, {
            commentsCount: Math.max(0, post.commentsCount - 1),
          })
      }
    }
    await ctx.db.patch(row._id, {
      content: '[deleted]',
      isDeleted: true,
      authorSnapshot: erasedActor,
      targetSnapshot: erasedTarget,
    })
  } else if (
    await referencesErasedIdentity(
      ctx,
      { targetId: row.targetId, targetType: row.targetType },
      userId,
    )
  ) {
    await ctx.db.patch(row._id, { targetSnapshot: erasedTarget })
  }
}

async function purgeTablePage(
  ctx: MutationCtx,
  table: (typeof PURGE_TABLES)[number],
  cursor: string | null,
  user: Doc<'users'>,
  accountIndexed: boolean,
) {
  const userId = user._id
  switch (table) {
    case 'comments':
      return visitPage(ctx, table, cursor, (row) =>
        scrubComment(ctx, row, userId),
      )
    case 'reactions':
      return visitPage(ctx, table, cursor, async (row) => {
        if (
          row.userId === userId ||
          (await referencesErasedIdentity(
            ctx,
            { targetType: row.targetType, targetId: row.targetId },
            userId,
          ))
        )
          await removeReaction(ctx, row)
      })
    case 'follows':
      return visitPage(ctx, table, cursor, async (row) => {
        if (row.followerId !== userId && row.followingId !== userId) return
        await decrementStat(ctx, row.followingId, 'followersCount')
        await decrementStat(ctx, row.followerId, 'followingCount')
        await ctx.db.delete(row._id)
      })
    case 'messages':
      return visitPage(ctx, table, cursor, async (row) => {
        const conversation = await ctx.db.get(row.conversationId)
        if (
          row.senderId === userId ||
          conversation?.participantLowId === userId ||
          conversation?.participantHighId === userId
        )
          await ctx.db.delete(row._id)
      })
    case 'conversations':
      return visitPage(ctx, table, cursor, async (row) => {
        if (row.participantLowId !== userId && row.participantHighId !== userId)
          return
        const otherId =
          row.participantLowId === userId
            ? row.participantHighId
            : row.participantLowId
        const other = await ctx.db.get(otherId)
        if (other)
          await ctx.db.patch(otherId, {
            unreadMessagesCount: Math.max(
              0,
              other.unreadMessagesCount - (row.unreadCounts[otherId] ?? 0),
            ),
          })
        await ctx.db.delete(row._id)
      })
    case 'notifications':
      return visitPage(ctx, table, cursor, async (row) => {
        if (await referencesErasedIdentity(ctx, row, userId))
          await ctx.db.delete(row._id)
      })
    case 'activity_events':
      return visitPage(ctx, table, cursor, async (row) => {
        if (await referencesErasedIdentity(ctx, row, userId))
          await ctx.db.delete(row._id)
      })
    case 'home_feed_items':
      return visitPage(ctx, table, cursor, async (row) => {
        if (await referencesErasedIdentity(ctx, row, userId))
          await ctx.db.delete(row._id)
      })
    case 'pulse_snapshots':
      return visitPage(ctx, table, cursor, async (row) => {
        if (await referencesErasedIdentity(ctx, row, userId))
          await ctx.db.delete(row._id)
      })
    case 'project_contributors':
      return visitPage(ctx, table, cursor, async (row) => {
        if (
          row.userId !== userId &&
          !(await ownedProject(ctx, row.projectId, userId))
        )
          return
        const contributionProject = await ctx.db.get(row.projectId)
        if (row.isActive && contributionProject?.locatic.isVisible)
          await decrementStat(ctx, row.userId, 'contributionsCount')
        if (row.userId === userId) {
          const project = await ctx.db.get(row.projectId)
          if (project)
            await ctx.db.patch(project._id, {
              topContributorsSnapshot: project.topContributorsSnapshot.filter(
                (item) => item.userId !== userId,
              ),
              contributorStats: {
                ...project.contributorStats,
                matchedCount: Math.max(
                  0,
                  project.contributorStats.matchedCount -
                    (row.isActive ? 1 : 0),
                ),
              },
            })
        }
        await ctx.db.delete(row._id)
      })
    case 'reports':
      return visitPage(
        ctx,
        table,
        cursor,
        async (row) => {
          if (row.reporterId === userId) await ctx.db.delete(row._id)
        },
        accountIndexed
          ? ctx.db
              .query(table)
              .withIndex('by_reporter', (q) => q.eq('reporterId', userId))
          : undefined,
      )
    case 'saved_projects':
      return visitPage(ctx, table, cursor, async (row) => {
        if (
          row.userId === userId ||
          (await ownedProject(ctx, row.projectId, userId))
        )
          await ctx.db.delete(row._id)
      })
    case 'github_tokens':
      return visitPage(
        ctx,
        table,
        cursor,
        async (row) => {
          if (row.userId === userId) await ctx.db.delete(row._id)
        },
        accountIndexed
          ? ctx.db
              .query(table)
              .withIndex('by_user_id', (q) => q.eq('userId', userId))
          : undefined,
      )
    case 'github_sync_log':
      return visitPage(
        ctx,
        table,
        cursor,
        async (row) => {
          if (row.userId === userId) await ctx.db.delete(row._id)
        },
        accountIndexed
          ? ctx.db
              .query(table)
              .withIndex('by_user_synced_at', (q) => q.eq('userId', userId))
          : undefined,
      )
    case 'explore_history':
      return visitPage(ctx, table, cursor, async (row) => {
        if (
          row.userId === userId ||
          (await ownedProject(ctx, row.projectId, userId))
        )
          await ctx.db.delete(row._id)
      })
    case 'explore_post_history':
      return visitPage(ctx, table, cursor, async (row) => {
        if (
          row.userId === userId ||
          (await referencesErasedIdentity(ctx, row, userId))
        )
          await ctx.db.delete(row._id)
      })
    case 'email_sends':
      return visitPage(
        ctx,
        table,
        cursor,
        async (row) => {
          if (row.userId === userId) await ctx.db.delete(row._id)
        },
        accountIndexed
          ? ctx.db
              .query(table)
              .withIndex('by_user_and_status_and_created_at', (q) =>
                q.eq('userId', userId),
              )
          : undefined,
      )
    case 'email_preference_changes':
      return visitPage(
        ctx,
        table,
        cursor,
        async (row) => {
          if (row.userId === userId) await ctx.db.delete(row._id)
        },
        accountIndexed
          ? ctx.db
              .query(table)
              .withIndex('by_user_and_changed_at', (q) =>
                q.eq('userId', userId),
              )
          : undefined,
      )
    case 'project_releases':
      return visitPage(ctx, table, cursor, async (row) => {
        if (await ownedProject(ctx, row.projectId, userId))
          await ctx.db.delete(row._id)
      })
    case 'posts':
      return visitPage(ctx, table, cursor, async (row) => {
        if (row.actorId === userId) {
          if (row.deletedAt == null) {
            const project = await ctx.db.get(row.projectId)
            if (project)
              await ctx.db.patch(project._id, {
                locatic: {
                  ...project.locatic,
                  postsCount: Math.max(
                    0,
                    (project.locatic.postsCount ?? 0) - 1,
                  ),
                },
              })
          }
          await ctx.db.patch(row._id, {
            body: '[deleted]',
            searchText: '',
            actorSnapshot: erasedActor,
            projectSnapshot: erasedProject,
            projectCityId: null,
            projectTopics: [],
            deletedAt: row.deletedAt ?? Date.now(),
            updatedAt: Date.now(),
          })
        } else if (row.ownerId === userId) {
          await ctx.db.patch(row._id, {
            projectSnapshot: erasedProject,
            projectCityId: null,
            projectTopics: [],
            searchText: row.body,
          })
        }
      })
    case 'projects':
      return visitPage(ctx, table, cursor, async (row) => {
        if (row.ownerId === userId) {
          const cityStats = createCityStatsChanges()
          await cityStats.moveProject(ctx.db, row, row, {
            exploreOwner: buildProjectExploreOwner(user, false),
          })
          await cityStats.apply(ctx.db)
          await ctx.db.delete(row._id)
        } else if (
          row.topContributorsSnapshot.some((item) => item.userId === userId)
        ) {
          await ctx.db.patch(row._id, {
            topContributorsSnapshot: row.topContributorsSnapshot.filter(
              (item) => item.userId !== userId,
            ),
          })
        }
      })
  }
}

export function buildPurgedAccount(user: Doc<'users'>, now: number) {
  const neutral = createDefaultViewerProfile({
    clerkId: user.clerkId,
    email: `deleted+${user._id}@locatic.invalid`,
    githubId: null,
    githubUsername: `deleted-${user._id}`,
    githubUrl: 'https://github.com',
    avatarUrl: '',
    displayName: 'Deleted User',
  })
  return {
    ...neutral,
    profile: { ...neutral.profile, fullName: null },
    discoverability: { searchText: '' },
    privacy: {
      ...neutral.privacy,
      profileVisibility: 'locatic_only' as const,
      followGraphVisibility: 'private' as const,
      commentHistoryVisibility: 'private' as const,
      likedProjectsVisibility: 'private' as const,
      contributionsVisibility: 'private' as const,
      cityVisibility: 'hidden' as const,
      appearInPulse: false,
    },
    notificationPrefs: Object.fromEntries(
      Object.keys(neutral.notificationPrefs).map((key) => [key, false]),
    ) as typeof neutral.notificationPrefs,
    appearInExplore: false,
    createdAt: now,
    deletedAt: user.deletedAt ?? now,
    deactivatedAt: user.deactivatedAt ?? now,
    purgedAt: now,
    purgeAfter: null,
  }
}

/** Caller checks due/deleted state in the same mutation before every page. */
export async function purgeAccountPage(ctx: MutationCtx, user: Doc<'users'>) {
  const progress = user.purgeProgress ?? { stage: 0, cursor: null }
  const table = PURGE_TABLES[progress.stage]
  if (!table) {
    await ctx.db.replace(user._id, buildPurgedAccount(user, Date.now()))
    return true
  }
  // Cursors belong to a query shape. A legacy non-null table-scan cursor must
  // finish that stage unchanged; a new stage can begin with its account index.
  const accountIndexed =
    progress.accountIndexed === true || progress.cursor === null
  const page = await purgeTablePage(
    ctx,
    table,
    progress.cursor,
    user,
    accountIndexed,
  )
  await ctx.db.patch(user._id, {
    purgeProgress: {
      stage: progress.stage + (page.isDone ? 1 : 0),
      cursor: page.isDone ? null : page.cursor,
      accountIndexed,
    },
  })
  return false
}
