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
import { getPubliclyInteractableProject } from './lib/project_access'
import {
  needsGithubReadmeUrlBaseKeyNormalization,
  normalizeLegacyGithubReadmeUrlBaseKeys,
} from './lib/github'

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

const githubReleaseImportValidator = v.object({
  githubReleaseId: v.number(),
  tagName: v.string(),
  name: v.union(v.string(), v.null()),
  body: v.union(v.string(), v.null()),
  htmlUrl: v.string(),
  isDraft: v.boolean(),
  isPrerelease: v.boolean(),
  publishedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const githubContributorImportValidator = v.object({
  githubId: v.number(),
  githubUsername: v.string(),
  commitCount: v.number(),
})

const projectReadmeUrlBaseVerificationValidator = v.object({
  continueCursor: v.union(v.string(), v.null()),
  done: v.boolean(),
  patched: v.number(),
  scanned: v.number(),
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
    const project = await getPubliclyInteractableProject(ctx, args.projectId)

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
        commentId: null,
        actorSnapshot: await buildActorSnapshot(ctx.db, viewer),
        projectSnapshot: buildProjectSnapshot(project),
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
      lastMetadataSyncAttemptedAt: v.optional(v.union(v.number(), v.null())),
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
        lastMetadataSyncAttemptedAt: Date.now(),
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

export const recordGithubSyncResult = internalMutation({
  args: {
    userId: v.id('users'),
    syncType: v.union(
      v.literal('initial'),
      v.literal('manual'),
      v.literal('metadata'),
      v.literal('readme'),
      v.literal('contributors'),
      v.literal('releases'),
      v.literal('scheduled'),
    ),
    reposFetched: v.number(),
    reposNew: v.number(),
    reposUpdated: v.number(),
    status: v.union(
      v.literal('success'),
      v.literal('failed'),
      v.literal('token_revoked'),
    ),
    error: v.union(v.string(), v.null()),
    githubRateLimitRemaining: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('github_sync_log', {
      ...args,
      syncedAt: Date.now(),
    })

    return null
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

    await ctx.db.patch(project._id, {
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

export const verifyProjectReadmeUrlBaseKeys = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: projectReadmeUrlBaseVerificationValidator,
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 500), 1), 1000)
    const page = await ctx.db.query('projects').paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    })
    let patched = 0

    for (const project of page.page) {
      const legacyGithub = project.github as typeof project.github &
        Record<string, unknown>
      const needsPatch = needsGithubReadmeUrlBaseKeyNormalization(legacyGithub)

      if (!needsPatch) {
        continue
      }

      await ctx.db.patch(project._id, {
        github: {
          ...project.github,
          ...normalizeLegacyGithubReadmeUrlBaseKeys(legacyGithub),
        },
        updatedAt: Date.now(),
      })
      patched += 1
    }

    return {
      continueCursor: page.isDone ? null : page.continueCursor,
      done: page.isDone,
      patched,
      scanned: page.page.length,
    }
  },
})

export const recordProjectMetadataSyncFailure = internalMutation({
  args: {
    error: v.string(),
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) {
      return null
    }

    const now = Date.now()
    await ctx.db.patch(project._id, {
      github: {
        ...project.github,
        lastMetadataSyncAttemptedAt: now,
      },
      updatedAt: now,
    })

    await ctx.db.insert('github_sync_log', {
      userId: project.ownerId,
      syncType: 'metadata',
      reposFetched: 1,
      reposNew: 0,
      reposUpdated: 0,
      status: 'failed',
      error: args.error,
      githubRateLimitRemaining: null,
      syncedAt: now,
    })

    return null
  },
})

export const listRefreshableProjectIds = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 25), 1), 100)
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_visible_metadata_attempted', (query) =>
        query.eq('locatic.isVisible', true),
      )
      .order('asc')
      .take(limit)

    return projects.map((project) => project._id)
  },
})

export const patchProjectReleases = internalMutation({
  args: {
    deleteMissing: v.optional(v.boolean()),
    projectId: v.id('projects'),
    releases: v.array(githubReleaseImportValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const current = await ctx.db
      .query('project_releases')
      .withIndex('by_project_release', (query) =>
        query.eq('projectId', args.projectId),
      )
      .collect()
    const currentByReleaseId = new Map(
      current.map((release) => [release.githubReleaseId, release]),
    )
    const seen = new Set<number>()
    let inserted = 0
    let updated = 0

    for (const release of args.releases) {
      seen.add(release.githubReleaseId)
      const existing = currentByReleaseId.get(release.githubReleaseId)
      const record = {
        ...release,
        projectId: args.projectId,
        importedAt: now,
      }

      if (existing) {
        await ctx.db.patch(existing._id, record)
        updated += 1
      } else {
        await ctx.db.insert('project_releases', record)
        inserted += 1
      }
    }

    if (args.deleteMissing ?? false) {
      for (const release of current) {
        if (!seen.has(release.githubReleaseId)) {
          await ctx.db.delete(release._id)
        }
      }
    }

    const deleted =
      (args.deleteMissing ?? false)
        ? current.filter((release) => !seen.has(release.githubReleaseId)).length
        : 0

    return {
      deleted,
      inserted,
      updated,
    }
  },
})

export const patchProjectContributors = internalMutation({
  args: {
    projectId: v.id('projects'),
    contributors: v.array(githubContributorImportValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const project = await ctx.db.get(args.projectId)
    if (!project) {
      return null
    }

    const existingContributors = await ctx.db
      .query('project_contributors')
      .withIndex('by_project', (query) => query.eq('projectId', args.projectId))
      .collect()
    const existingByGithubId = new Map(
      existingContributors.map((contributor) => [
        contributor.githubId,
        contributor,
      ]),
    )
    const seenGithubIds = new Set<number>()
    const touchedUserIds = new Set<string>()
    const matchedContributors: Array<{
      userId: typeof project.ownerId
      displayName: string
      avatarUrl: string | null
      commitCount: number
    }> = []

    for (const contributor of args.contributors) {
      seenGithubIds.add(contributor.githubId)
      const user = await ctx.db
        .query('users')
        .withIndex('by_github_id', (query) =>
          query.eq('github.id', contributor.githubId),
        )
        .unique()
      const existing = existingByGithubId.get(contributor.githubId)

      if (!user || user.deletedAt !== null || user.deactivatedAt !== null) {
        if (existing?.isActive) {
          await ctx.db.patch(existing._id, {
            isActive: false,
            lastConfirmedAt: now,
          })
          touchedUserIds.add(String(existing.userId))
        }
        continue
      }

      touchedUserIds.add(String(user._id))
      matchedContributors.push({
        userId: user._id,
        displayName: user.profile.displayName,
        avatarUrl: user.profile.avatarUrl,
        commitCount: contributor.commitCount,
      })

      const record = {
        projectId: args.projectId,
        userId: user._id,
        githubId: contributor.githubId,
        githubUsername: contributor.githubUsername,
        commitCount: contributor.commitCount,
        role: 'contributor' as const,
        isActive: true,
        lastConfirmedAt: now,
        userSnapshot: {
          displayName: user.profile.displayName,
          avatarUrl: user.profile.avatarUrl,
        },
      }

      if (existing) {
        await ctx.db.patch(existing._id, record)
      } else {
        await ctx.db.insert('project_contributors', {
          ...record,
          firstMatchedAt: now,
        })
      }
    }

    for (const contributor of existingContributors) {
      if (!seenGithubIds.has(contributor.githubId) && contributor.isActive) {
        await ctx.db.patch(contributor._id, {
          isActive: false,
          lastConfirmedAt: now,
        })
        touchedUserIds.add(String(contributor.userId))
      }
    }

    for (const userIdString of touchedUserIds) {
      const userId = ctx.db.normalizeId('users', userIdString)
      const user = userId ? await ctx.db.get(userId) : null
      if (!user) {
        continue
      }
      const activeContributions = await ctx.db
        .query('project_contributors')
        .withIndex('by_user', (query) => query.eq('userId', user._id))
        .collect()
      await ctx.db.patch(user._id, {
        stats: {
          ...user.stats,
          contributionsCount: activeContributions.filter(
            (contribution) => contribution.isActive,
          ).length,
        },
        updatedAt: now,
      })
    }

    const topContributorsSnapshot = matchedContributors
      .sort((left, right) => right.commitCount - left.commitCount)
      .slice(0, 5)
      .map((contributor) => ({
        userId: contributor.userId,
        displayName: contributor.displayName,
        avatarUrl: contributor.avatarUrl ?? '',
        commitCount: contributor.commitCount,
      }))

    await ctx.db.patch(project._id, {
      topContributorsSnapshot,
      contributorStats: {
        ...project.contributorStats,
        matchedCount: matchedContributors.length,
        lastSyncedAt: now,
      },
      updatedAt: now,
    })

    return {
      matchedCount: matchedContributors.length,
      totalFetched: args.contributors.length,
    }
  },
})
