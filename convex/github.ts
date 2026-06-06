import { ConvexError, v } from 'convex/values'

import { internalMutation, internalQuery } from './_generated/server'
import { fanOutActivityEventToFollowers } from './lib/homeFeed'
import {
  createNotificationIfEnabled,
  buildProjectNotificationTarget,
} from './lib/notifications'
import { buildActorSnapshot, buildProjectSnapshot } from './lib/snapshots'
import {
  normalizeProjectRouteKey,
  resolveProjectOwnerLogin,
} from './lib/project_route'

const MAX_README_BACKFILL_BATCH = 100
const README_BACKFILL_SCAN_PAGE_SIZE = 100

const projectReadmeBackfillTargetValidator = v.object({
  currentReadmeLength: v.number(),
  fullName: v.string(),
  projectId: v.id('projects'),
})

const projectReadmeBackfillBatchPageValidator = v.object({
  continueCursor: v.string(),
  hasMore: v.boolean(),
  remainingLowerBound: v.number(),
  scanned: v.number(),
  targets: v.array(projectReadmeBackfillTargetValidator),
  totalCandidatesLowerBound: v.number(),
})

function projectNeedsReadmeBackfill(
  project: {
    github: {
      description: string | null
      readmePreview: string | null
    }
    locatic: {
      isVisible: boolean
    }
  },
  refreshAll: boolean,
) {
  if (!project.locatic.isVisible) {
    return false
  }

  if (refreshAll) {
    return true
  }

  const readmePreview = project.github.readmePreview?.trim() ?? ''
  const description = project.github.description?.trim() ?? ''
  return !readmePreview || readmePreview === description
}

export const applyProjectLike = internalMutation({
  args: {
    projectId: v.id('projects'),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (query) => query.eq('clerkId', args.clerkId))
      .unique()
    const project = await ctx.db.get(args.projectId)

    if (!viewer || !project) {
      throw new ConvexError('Missing project or viewer')
    }

    const existing = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_reaction', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetId', String(project._id))
          .eq('reactionType', 'like'),
      )
      .unique()

    if (!existing) {
      await ctx.db.insert('reactions', {
        userId: viewer._id,
        targetType: 'project',
        targetId: String(project._id),
        reactionType: 'like',
        createdAt: Date.now(),
      })

      await ctx.db.patch(viewer._id, {
        stats: {
          ...viewer.stats,
          likedCount: viewer.stats.likedCount + 1,
        },
        updatedAt: Date.now(),
      })

      const eventId = await ctx.db.insert('activity_events', {
        actorId: viewer._id,
        eventType: 'project_liked',
        projectId: project._id,
        updateId: null,
        commentId: null,
        actorSnapshot: await buildActorSnapshot(ctx.db, viewer),
        projectSnapshot: buildProjectSnapshot(project),
        updateSnapshot: null,
        createdAt: Date.now(),
      })

      const event = await ctx.db.get(eventId)
      if (event) {
        await fanOutActivityEventToFollowers(ctx, event)
      }

      const owner = await ctx.db.get(project.ownerId)
      if (owner) {
        await createNotificationIfEnabled(ctx, {
          recipient: owner,
          actor: viewer,
          type: 'project_liked',
          projectId: project._id,
          projectName: project.github.name,
          target: buildProjectNotificationTarget({
            fullName: project.github.fullName,
            owner: resolveProjectOwnerLogin(project),
            repo: project.github.name,
          }),
        })
      }
    }

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        likesCount: existing
          ? project.locatic.likesCount
          : project.locatic.likesCount + 1,
      },
      updatedAt: Date.now(),
    })

    const history = await ctx.db
      .query('explore_history')
      .withIndex('by_user_project', (query) =>
        query.eq('userId', viewer._id).eq('projectId', project._id),
      )
      .unique()

    if (history) {
      await ctx.db.patch(history._id, {
        likedAt: Date.now(),
        lastSeenAt: Date.now(),
        dismissedAt: null,
      })
    }

    return null
  },
})

export const removeProjectLike = internalMutation({
  args: {
    projectId: v.id('projects'),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (query) => query.eq('clerkId', args.clerkId))
      .unique()
    const project = await ctx.db.get(args.projectId)

    if (!viewer || !project) {
      throw new ConvexError('Missing project or viewer')
    }

    const existing = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_reaction', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetId', String(project._id))
          .eq('reactionType', 'like'),
      )
      .unique()

    if (existing) {
      await ctx.db.delete(existing._id)
      await ctx.db.patch(viewer._id, {
        stats: {
          ...viewer.stats,
          likedCount: Math.max(0, viewer.stats.likedCount - 1),
        },
        updatedAt: Date.now(),
      })
    }

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        likesCount: Math.max(
          0,
          project.locatic.likesCount - (existing ? 1 : 0),
        ),
      },
      updatedAt: Date.now(),
    })

    return null
  },
})

export const patchProjectMetadata = internalMutation({
  args: {
    projectId: v.id('projects'),
    repository: v.object({
      repoId: v.number(),
      fullName: v.string(),
      ownerLogin: v.string(),
      ownerLoginKey: v.string(),
      name: v.string(),
      nameKey: v.string(),
      description: v.union(v.string(), v.null()),
      githubUrl: v.string(),
      projectUrl: v.union(v.string(), v.null()),
      primaryLanguage: v.union(v.string(), v.null()),
      languages: v.array(
        v.object({
          name: v.string(),
          bytes: v.number(),
        }),
      ),
      topics: v.array(v.string()),
      stargazersCount: v.number(),
      lastCommitAt: v.number(),
      lastMetadataSyncedAt: v.union(v.number(), v.null()),
      readmePreview: v.union(v.string(), v.null()),
      readmeAssetBaseUrl: v.union(v.string(), v.null()),
      readmeAssetRootUrl: v.union(v.string(), v.null()),
      readmeLinkBaseUrl: v.union(v.string(), v.null()),
      readmeLinkRootUrl: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) {
      return null
    }

    await ctx.db.patch(project._id, {
      github: {
        ...project.github,
        ...args.repository,
        ownerLoginKey: normalizeProjectRouteKey(args.repository.ownerLogin),
        nameKey: normalizeProjectRouteKey(args.repository.name),
        commitFrequency:
          Date.now() - args.repository.lastCommitAt <= 7 * 24 * 60 * 60 * 1000
            ? 'active'
            : Date.now() - args.repository.lastCommitAt <=
                30 * 24 * 60 * 60 * 1000
              ? 'slow'
              : 'dormant',
      },
      updatedAt: Date.now(),
    })

    return null
  },
})

export const recordGithubTokenState = internalMutation({
  args: {
    userId: v.id('users'),
    tokenStatus: v.union(
      v.literal('active'),
      v.literal('revoked'),
      v.literal('needs_reauth'),
    ),
    scopes: v.array(v.string()),
    lastError: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('github_tokens')
      .withIndex('by_user_id', (query) => query.eq('userId', args.userId))
      .unique()
    const now = Date.now()

    if (existing) {
      await ctx.db.patch(existing._id, {
        tokenStatus: args.tokenStatus,
        scopes: args.scopes,
        lastUsedAt: now,
        lastValidatedAt: now,
        lastError: args.lastError,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert('github_tokens', {
      userId: args.userId,
      tokenStatus: args.tokenStatus,
      scopes: args.scopes,
      lastUsedAt: now,
      lastValidatedAt: now,
      lastError: args.lastError,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const likedProjectsByUser = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const likes = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_type', (query) =>
        query
          .eq('userId', args.userId)
          .eq('targetType', 'project')
          .eq('reactionType', 'like'),
      )
      .collect()

    return await Promise.all(
      likes.map(async (like) => {
        const projectId = ctx.db.normalizeId('projects', like.targetId)
        const project = projectId ? await ctx.db.get(projectId) : null
        return {
          reactionId: like._id,
          projectId: like.targetId,
          projectFullName: project?.github.fullName ?? null,
        }
      }),
    )
  },
})

export const listProjectReadmeBackfillTargets = internalQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
    refreshAll: v.optional(v.boolean()),
  },
  returns: projectReadmeBackfillBatchPageValidator,
  handler: async (ctx, args) => {
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? MAX_README_BACKFILL_BATCH), 1),
      MAX_README_BACKFILL_BATCH,
    )
    const refreshAll = args.refreshAll ?? false
    const page = await ctx.db
      .query('projects')
      .withIndex('by_visible_added', (query) =>
        query.eq('locatic.isVisible', true),
      )
      .order('desc')
      .paginate({
        cursor: args.cursor ?? null,
        numItems: README_BACKFILL_SCAN_PAGE_SIZE,
      })
    const candidates = page.page.filter((project) =>
      projectNeedsReadmeBackfill(project, refreshAll),
    )

    return {
      continueCursor: page.continueCursor,
      hasMore: !page.isDone || candidates.length > limit,
      remainingLowerBound: Math.max(0, candidates.length - limit),
      scanned: page.page.length,
      targets: candidates.slice(0, limit).map((project) => ({
        currentReadmeLength: project.github.readmePreview?.length ?? 0,
        fullName: project.github.fullName,
        projectId: project._id,
      })),
      totalCandidatesLowerBound: candidates.length,
    }
  },
})

export const patchProjectReadmePreview = internalMutation({
  args: {
    projectId: v.id('projects'),
    readmePreview: v.union(v.string(), v.null()),
    readmeAssetBaseUrl: v.union(v.string(), v.null()),
    readmeAssetRootUrl: v.union(v.string(), v.null()),
    readmeLinkBaseUrl: v.union(v.string(), v.null()),
    readmeLinkRootUrl: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) {
      return null
    }

    await ctx.db.patch('projects', project._id, {
      github: {
        ...project.github,
        lastMetadataSyncedAt: Date.now(),
        readmePreview: args.readmePreview,
        readmeAssetBaseUrl: args.readmeAssetBaseUrl,
        readmeAssetRootUrl: args.readmeAssetRootUrl,
        readmeLinkBaseUrl: args.readmeLinkBaseUrl,
        readmeLinkRootUrl: args.readmeLinkRootUrl,
      },
      updatedAt: Date.now(),
    })

    return null
  },
})

export const listRefreshableProjects = internalQuery({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query('projects').collect()).filter(
      (project) => project.locatic.isVisible,
    )
  },
})
