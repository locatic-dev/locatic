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
import { buildPostSearchText } from './lib/posts'
import { canPinProject } from './lib/project_pins'
import { resolvePublicCityLabel } from './lib/project_previews'
import {
  buildOwnerSnapshot,
  buildProjectExploreOwner,
  buildProjectSnapshot,
} from './lib/snapshots'
import { normalizeProjectTopics } from './lib/topics'

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
    const requesterIdentity = await ctx.auth.getUserIdentity()
    const requester = requesterIdentity
      ? await ctx.db
          .query('users')
          .withIndex('by_clerk_id', (query) =>
            query.eq('clerkId', requesterIdentity.subject),
          )
          .unique()
      : null
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

    const viewerHasLiked = requester
      ? await ctx.db
          .query('reactions')
          .withIndex('by_user_target_reaction', (query) =>
            query
              .eq('userId', requester._id)
              .eq('targetId', String(project._id))
              .eq('reactionType', 'like'),
          )
          .unique()
      : null

    const viewerFollowsOwner = requester
      ? await ctx.db
          .query('follows')
          .withIndex('by_pair', (query) =>
            query.eq('followerId', requester._id).eq('followingId', owner._id),
          )
          .unique()
      : null

    const likedByReactions = await ctx.db
      .query('reactions')
      .withIndex('by_target_reaction_created', (query) =>
        query
          .eq('targetType', 'project')
          .eq('targetId', String(project._id))
          .eq('reactionType', 'like'),
      )
      .order('desc')
      .take(3)

    const likedByPreview = (
      await Promise.all(
        likedByReactions.map(async (reaction) => {
          const user = await ctx.db.get(reaction.userId)
          if (!user || user.deletedAt || user.deactivatedAt) {
            return null
          }

          return {
            userId: user._id,
            githubUsername: user.github.username,
            displayName: user.profile.displayName,
            avatarUrl: user.profile.avatarUrl,
          }
        }),
      )
    ).filter(Boolean)

    const ownerCity = owner.profile.cityId
      ? await ctx.db.get(owner.profile.cityId)
      : null

    return {
      project,
      updates,
      comments: [],
      likedByPreview,
      viewerHasLiked: Boolean(viewerHasLiked),
      viewerFollowsOwner: Boolean(viewerFollowsOwner),
      owner: {
        userId: owner._id,
        githubUsername: owner.github.username,
        displayName: owner.profile.displayName,
        avatarUrl: owner.profile.avatarUrl,
        socialLinks: owner.profile.socialLinks,
        buildStatus: owner.profile.buildStatus,
        city: resolvePublicCityLabel(owner, ownerCity?.displayName ?? null),
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

    const visibilityChanged = project.locatic.isVisible !== args.isVisible
    const pinnedProjectIds = new Set(viewer.pinnedProfileProjectIds)
    if (!args.isVisible) {
      pinnedProjectIds.delete(project._id)
    }

    const nextProjectsCount = visibilityChanged
      ? args.isVisible
        ? viewer.stats.projectsCount + 1
        : Math.max(0, viewer.stats.projectsCount - 1)
      : viewer.stats.projectsCount

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        isVisible: args.isVisible,
      },
      exploreOwner: buildProjectExploreOwner(viewer, args.isVisible),
      updatedAt: Date.now(),
    })

    await ctx.db.patch(viewer._id, {
      pinnedProfileProjectIds: [...pinnedProjectIds],
      stats: {
        ...viewer.stats,
        projectsCount: nextProjectsCount,
      },
      updatedAt: Date.now(),
    })

    return {
      projectId: project._id,
      isVisible: args.isVisible,
      pinnedProjectIds: [...pinnedProjectIds],
      projectsCount: nextProjectsCount,
    }
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

    if (args.pinned && !canPinProject(project)) {
      throw new ConvexError('Hidden projects cannot be pinned')
    }

    const currentIds = new Set(viewer.pinnedProfileProjectIds)
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
      pinnedProfileProjectIds: nextPinnedProjects,
      updatedAt: Date.now(),
    })

    return nextPinnedProjects
  },
})

export const updateTopics = mutation({
  args: {
    projectId: v.id('projects'),
    topics: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== viewer._id) {
      throw new ConvexError('Project not found')
    }

    const topics = normalizeProjectTopics(args.topics)
    const now = Date.now()

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        tags: topics,
        topicsEditedAt: now,
      },
      updatedAt: now,
    })

    const posts = await ctx.db
      .query('posts')
      .withIndex('by_project_deleted_created', (query) =>
        query.eq('projectId', project._id).eq('deletedAt', null),
      )
      .collect()

    await Promise.all(
      posts.map((post) =>
        ctx.db.patch(post._id, {
          projectTopics: topics,
          searchText: buildPostSearchText({
            body: post.body,
            projectFullName: project.github.fullName,
            topics,
          }),
        }),
      ),
    )

    return topics
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
    const skippedRepos: string[] = []
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
        github: {
          ...repository,
          commitFrequency: getCommitFrequency(repository.lastCommitAt),
        },
        locatic: existing?.locatic ?? {
          isVisible: true,
          tags: normalizeProjectTopics(repository.topics),
          likesCount: 0,
          commentsCount: 0,
          updatesCount: 0,
          postsCount: 0,
        },
        exploreOwner: buildProjectExploreOwner(
          owner,
          existing?.locatic.isVisible ?? true,
        ),
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
        if (existing.ownerId !== owner._id) {
          skippedRepos.push(repository.fullName)
          continue
        }

        await ctx.db.patch(existing._id, projectRecord)
        reposUpdated += 1
        continue
      }

      const projectId = await ctx.db.insert('projects', {
        ...projectRecord,
        ownerId: owner._id,
      })
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
        postId: null,
        commentId: null,
        actorSnapshot: {
          displayName: owner.profile.displayName,
          avatarUrl: owner.profile.avatarUrl,
          cityId: owner.profile.cityId,
          cityName: ownerSnapshot.cityName,
        },
        projectSnapshot: buildProjectSnapshot(project),
        updateSnapshot: null,
        postSnapshot: null,
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
            .withIndex('by_owner_visible', (query) =>
              query.eq('ownerId', owner._id).eq('locatic.isVisible', true),
            )
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
      skippedRepos,
    }
  },
})
