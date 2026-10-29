import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { createCityStatsChanges } from './cityStats'
import { buildProjectExploreOwner } from './snapshots'
import {
  getNextCommentReactionState,
  getNextPostReactionCounts,
  getNextProjectReactionLocatic,
} from './reactions'

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

/**
 * Per-table erasure rules. Every query plan (legacy global scans and indexed
 * phases) applies the same visitor, so a broader query never erases more and
 * an indexed query cannot skip a rule.
 */
export function createPurgeVisitors(ctx: MutationCtx, user: Doc<'users'>) {
  const userId = user._id
  // Rows on one target repeat its project; read each ownership once per page.
  const ownership = new Map<Id<'projects'>, Promise<boolean>>()
  const isOwnedProject = (projectId: Id<'projects'>) => {
    let owned = ownership.get(projectId)
    if (!owned) {
      owned = ownedProject(ctx, projectId, userId)
      ownership.set(projectId, owned)
    }
    return owned
  }
  const deleteIfReferenced = async (
    row: Doc<
      | 'notifications'
      | 'activity_events'
      | 'home_feed_items'
      | 'pulse_snapshots'
    >,
  ) => {
    if (await referencesErasedIdentity(ctx, row, userId))
      await ctx.db.delete(row._id)
  }
  const deleteOwnRow = async (
    row: Doc<
      | 'reports'
      | 'github_tokens'
      | 'github_sync_log'
      | 'email_sends'
      | 'email_preference_changes'
    >,
  ) => {
    const ownerId = 'reporterId' in row ? row.reporterId : row.userId
    if (ownerId === userId) await ctx.db.delete(row._id)
  }
  return {
    comments: (row: Doc<'comments'>) => scrubComment(ctx, row, userId),
    reactions: async (row: Doc<'reactions'>) => {
      if (
        row.userId === userId ||
        (await referencesErasedIdentity(
          ctx,
          { targetType: row.targetType, targetId: row.targetId },
          userId,
        ))
      )
        await removeReaction(ctx, row)
    },
    follows: async (row: Doc<'follows'>) => {
      if (row.followerId !== userId && row.followingId !== userId) return
      await decrementStat(ctx, row.followingId, 'followersCount')
      await decrementStat(ctx, row.followerId, 'followingCount')
      await ctx.db.delete(row._id)
    },
    notifications: deleteIfReferenced,
    messages: async (row: Doc<'messages'>) => {
      const conversation = await ctx.db.get(row.conversationId)
      if (
        row.senderId === userId ||
        conversation?.participantLowId === userId ||
        conversation?.participantHighId === userId
      )
        await ctx.db.delete(row._id)
    },
    conversations: async (row: Doc<'conversations'>) => {
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
    },
    activity_events: deleteIfReferenced,
    home_feed_items: deleteIfReferenced,
    pulse_snapshots: deleteIfReferenced,
    project_contributors: async (row: Doc<'project_contributors'>) => {
      if (row.userId !== userId && !(await isOwnedProject(row.projectId)))
        return
      const project = await ctx.db.get(row.projectId)
      if (row.isActive && project?.locatic.isVisible)
        await decrementStat(ctx, row.userId, 'contributionsCount')
      if (row.userId === userId && project)
        await ctx.db.patch(project._id, {
          topContributorsSnapshot: project.topContributorsSnapshot.filter(
            (item) => item.userId !== userId,
          ),
          contributorStats: {
            ...project.contributorStats,
            matchedCount: Math.max(
              0,
              project.contributorStats.matchedCount - (row.isActive ? 1 : 0),
            ),
          },
        })
      await ctx.db.delete(row._id)
    },
    reports: deleteOwnRow,
    saved_projects: async (row: Doc<'saved_projects'>) => {
      if (row.userId === userId || (await isOwnedProject(row.projectId)))
        await ctx.db.delete(row._id)
    },
    github_tokens: deleteOwnRow,
    github_sync_log: deleteOwnRow,
    explore_history: async (row: Doc<'explore_history'>) => {
      if (row.userId === userId || (await isOwnedProject(row.projectId)))
        await ctx.db.delete(row._id)
    },
    explore_post_history: async (row: Doc<'explore_post_history'>) => {
      if (
        row.userId === userId ||
        (await referencesErasedIdentity(ctx, row, userId))
      )
        await ctx.db.delete(row._id)
    },
    email_sends: deleteOwnRow,
    email_preference_changes: deleteOwnRow,
    project_releases: async (row: Doc<'project_releases'>) => {
      if (await isOwnedProject(row.projectId)) await ctx.db.delete(row._id)
    },
    posts: async (row: Doc<'posts'>) => {
      if (row.actorId === userId) {
        if (row.deletedAt == null) {
          const project = await ctx.db.get(row.projectId)
          if (project)
            await ctx.db.patch(project._id, {
              locatic: {
                ...project.locatic,
                postsCount: Math.max(0, (project.locatic.postsCount ?? 0) - 1),
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
    },
    projects: async (row: Doc<'projects'>) => {
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
    },
  }
}

export type PurgeVisitors = ReturnType<typeof createPurgeVisitors>
export type PurgeTable = keyof PurgeVisitors
