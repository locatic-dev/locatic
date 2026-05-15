import { ConvexError, v } from 'convex/values'

import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'
import { fanOutActivityEventToFollowers } from './lib/homeFeed'
import { getViewerOrThrow } from './lib/auth'
import { buildOwnerSnapshot, buildProjectSnapshot } from './lib/snapshots'

function getCommitFrequency(lastCommitAt: number) {
  const ageDays = (Date.now() - lastCommitAt) / (24 * 60 * 60 * 1000)
  if (ageDays <= 7) return 'active' as const
  if (ageDays <= 30) return 'slow' as const
  return 'dormant' as const
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    return await ctx.db
      .query('projects')
      .withIndex('by_owner', (query) => query.eq('ownerId', viewer._id))
      .collect()
  },
})

export const getPublicByFullName = query({
  args: {
    fullName: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_full_name', (query) =>
        query.eq('github.fullName', args.fullName),
      )
      .unique()

    if (!project || !project.locatic.isVisible) {
      return null
    }

    const owner = await ctx.db.get(project.ownerId)
    if (!owner || owner.deletedAt || owner.deactivatedAt) {
      return null
    }

    const updates = await ctx.db
      .query('updates')
      .withIndex('by_project', (query) => query.eq('projectId', project._id))
      .collect()

    const comments = await ctx.db
      .query('comments')
      .withIndex('by_target_parent', (query) =>
        query.eq('targetId', String(project._id)).eq('parentId', null),
      )
      .collect()

    return {
      project,
      updates,
      comments: comments.sort(
        (left, right) => right.likesCount - left.likesCount,
      ),
      owner: {
        githubUsername: owner.github.username,
        displayName: owner.profile.displayName,
        avatarUrl: owner.profile.avatarUrl,
        socialLinks: owner.profile.socialLinks,
        buildStatus: owner.profile.buildStatus,
      },
    }
  },
})

export const listVisibleByUsername = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await ctx.db
      .query('users')
      .withIndex('by_github_username', (query) =>
        query.eq('github.username', args.username),
      )
      .unique()

    if (!owner) {
      return []
    }

    return await ctx.db
      .query('projects')
      .withIndex('by_owner_visible', (query) =>
        query.eq('ownerId', owner._id).eq('locatic.isVisible', true),
      )
      .collect()
  },
})

export const updateVisibility = mutation({
  args: {
    projectId: v.id('projects'),
    isVisible: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== viewer._id) {
      throw new ConvexError('Project not found')
    }

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        isVisible: args.isVisible,
      },
      updatedAt: Date.now(),
    })

    return null
  },
})

export const pinOwnedProject = mutation({
  args: {
    projectId: v.id('projects'),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== viewer._id) {
      throw new ConvexError('Project not found')
    }

    const currentIds = new Set(viewer.pinnedOwnedProjectIds)
    if (args.pinned) {
      currentIds.add(args.projectId)
    } else {
      currentIds.delete(args.projectId)
    }

    const nextPinnedProjects = [...currentIds]
    if (nextPinnedProjects.length > 3) {
      throw new ConvexError('You can pin at most three projects')
    }

    await ctx.db.patch(viewer._id, {
      pinnedOwnedProjectIds: nextPinnedProjects,
      updatedAt: Date.now(),
    })

    return nextPinnedProjects
  },
})

export const refreshMetadata = action({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args): Promise<unknown> => {
    await ctx.runAction(internal.github_actions.refreshProjectMetadata, {
      projectId: args.projectId,
    })

    return await ctx.runQuery(internal.projects.projectById, {
      projectId: args.projectId,
    })
  },
})

export const projectById = internalQuery({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId)
  },
})

export const upsertImportedRepositories = internalMutation({
  args: {
    ownerId: v.id('users'),
    repositories: v.array(
      v.object({
        repoId: v.number(),
        fullName: v.string(),
        name: v.string(),
        description: v.union(v.string(), v.null()),
        githubUrl: v.string(),
        projectUrl: v.union(v.string(), v.null()),
        primaryLanguage: v.union(v.string(), v.null()),
        topics: v.array(v.string()),
        stargazersCount: v.number(),
        lastCommitAt: v.number(),
        lastMetadataSyncedAt: v.union(v.number(), v.null()),
        readmePreview: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId)
    if (!owner) {
      throw new ConvexError('Owner not found')
    }

    const ownerSnapshot = await buildOwnerSnapshot(ctx.db, owner)
    let reposNew = 0
    let reposUpdated = 0
    const now = Date.now()
    const createdProjectIds = []

    for (const repository of args.repositories) {
      const existing = await ctx.db
        .query('projects')
        .withIndex('by_github_repo_id', (query) =>
          query.eq('github.repoId', repository.repoId),
        )
        .unique()

      const projectRecord = {
        ownerId: owner._id,
        github: {
          ...repository,
          commitFrequency: getCommitFrequency(repository.lastCommitAt),
        },
        locatic: existing?.locatic ?? {
          isVisible: true,
          tags: repository.topics,
          likesCount: 0,
          commentsCount: 0,
          updatesCount: 0,
        },
        ownerSnapshot,
        topContributorsSnapshot: existing?.topContributorsSnapshot ?? [],
        contributorStats: existing?.contributorStats ?? {
          matchedCount: 0,
          lastSyncedAt: null,
          syncCadence: 'weekly',
        },
        addedToLocaticAt: existing?.addedToLocaticAt ?? now,
        updatedAt: now,
      }

      if (existing) {
        await ctx.db.patch(existing._id, projectRecord)
        reposUpdated += 1
        continue
      }

      const projectId = await ctx.db.insert('projects', projectRecord)
      createdProjectIds.push(projectId)
      reposNew += 1

      const project = await ctx.db.get(projectId)
      if (!project) {
        continue
      }

      const eventId = await ctx.db.insert('activity_events', {
        actorId: owner._id,
        eventType: 'project_posted',
        projectId,
        updateId: null,
        commentId: null,
        actorSnapshot: {
          displayName: owner.profile.displayName,
          avatarUrl: owner.profile.avatarUrl,
          cityId: owner.profile.cityId,
          cityName: ownerSnapshot.cityName,
        },
        projectSnapshot: buildProjectSnapshot(project),
        updateSnapshot: null,
        createdAt: now,
      })

      const event = await ctx.db.get(eventId)
      if (event) {
        await fanOutActivityEventToFollowers(ctx, event)
      }
    }

    await ctx.db.patch(owner._id, {
      stats: {
        ...owner.stats,
        projectsCount: (
          await ctx.db
            .query('projects')
            .withIndex('by_owner', (query) => query.eq('ownerId', owner._id))
            .collect()
        ).length,
      },
      githubLastSyncedAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('github_sync_log', {
      userId: owner._id,
      syncType: 'manual',
      reposFetched: args.repositories.length,
      reposNew,
      reposUpdated,
      status: 'success',
      error: null,
      githubRateLimitRemaining: null,
      syncedAt: now,
    })

    return {
      createdProjectIds,
      reposNew,
      reposUpdated,
    }
  },
})
