import { ConvexError, v } from 'convex/values'
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'

import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { fanOutActivityEventToFollowers } from './lib/homeFeed'
import {
  buildViewerSeedFromIdentity,
  getViewerOrThrow,
  requireIdentity,
} from './lib/auth'
import { buildPostSearchText } from './lib/posts'
import { getPubliclyInteractableProject } from './lib/project_access'
import { canPinProject } from './lib/project_pins'
import { resolvePublicCityLabel } from './lib/project_previews'
import {
  getOwnerLoginFromFullName,
  normalizeProjectRouteKey,
  resolveProjectOwnerLogin,
} from './lib/project_route'
import {
  buildOwnerSnapshot,
  buildProjectExploreOwner,
  buildProjectSnapshot,
} from './lib/snapshots'
import { recomputeContributionCountsForUsers } from './lib/project_contributor_sync'
import { normalizeProjectTopics } from './lib/topics'
import { buildStatusValidator, socialLinksValidator } from './lib/validators'
import { enforceRateLimit } from './lib/rate_limits'

function getCommitFrequency(lastCommitAt: number) {
  const ageDays = (Date.now() - lastCommitAt) / (24 * 60 * 60 * 1000)
  if (ageDays <= 7) return 'active' as const
  if (ageDays <= 30) return 'slow' as const
  return 'dormant' as const
}

function getSnapshotOwnerLogin(args: {
  fallbackProjectId: string
  fullName: string
  ownerLoginByProjectId: Map<string, string>
}) {
  return (
    args.ownerLoginByProjectId.get(args.fallbackProjectId) ??
    getOwnerLoginFromFullName(args.fullName)
  )
}

const projectLikerValidator = v.object({
  userId: v.id('users'),
  githubUsername: v.string(),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
})

const projectDetailValidator = v.union(
  v.object({
    project: v.any(),
    releases: v.array(v.any()),
    comments: v.array(v.any()),
    likedByPreview: v.array(projectLikerValidator),
    viewerHasLiked: v.boolean(),
    viewerFollowsOwner: v.boolean(),
    owner: v.object({
      userId: v.id('users'),
      githubUsername: v.string(),
      displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()),
      socialLinks: socialLinksValidator,
      buildStatus: buildStatusValidator,
      city: v.union(v.string(), v.null()),
    }),
    canonicalRoute: v.object({
      owner: v.string(),
      repo: v.string(),
    }),
  }),
  v.null(),
)

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

export const backfillRouteFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query('projects').collect()
    const ownerLoginByProjectId = new Map<string, string>()
    let projectsPatched = 0
    let snapshotsPatched = 0
    const now = Date.now()

    for (const project of projects) {
      const ownerLogin = resolveProjectOwnerLogin(project)
      ownerLoginByProjectId.set(String(project._id), ownerLogin)

      if (
        project.github.ownerLogin !== ownerLogin ||
        project.github.ownerLoginKey !== normalizeProjectRouteKey(ownerLogin) ||
        project.github.nameKey !== normalizeProjectRouteKey(project.github.name)
      ) {
        await ctx.db.patch(project._id, {
          github: {
            ...project.github,
            ownerLogin,
            ownerLoginKey: normalizeProjectRouteKey(ownerLogin),
            nameKey: normalizeProjectRouteKey(project.github.name),
          },
          updatedAt: now,
        })
        projectsPatched += 1
      }
    }

    const posts = await ctx.db.query('posts').collect()
    for (const post of posts) {
      if (post.projectSnapshot.ownerLogin) {
        continue
      }

      await ctx.db.patch(post._id, {
        projectSnapshot: {
          ...post.projectSnapshot,
          ownerLogin: getSnapshotOwnerLogin({
            fallbackProjectId: String(post.projectId),
            fullName: post.projectSnapshot.fullName,
            ownerLoginByProjectId,
          }),
        },
      })
      snapshotsPatched += 1
    }

    const events = await ctx.db.query('activity_events').collect()
    for (const event of events) {
      if (!event.projectId || !event.projectSnapshot?.fullName) {
        continue
      }

      if (event.projectSnapshot.ownerLogin) {
        continue
      }

      await ctx.db.patch(event._id, {
        projectSnapshot: {
          ...event.projectSnapshot,
          ownerLogin: getSnapshotOwnerLogin({
            fallbackProjectId: String(event.projectId),
            fullName: event.projectSnapshot.fullName,
            ownerLoginByProjectId,
          }),
        },
      })
      snapshotsPatched += 1
    }

    const feedItems = await ctx.db.query('home_feed_items').collect()
    for (const item of feedItems) {
      if (!item.projectId || !item.projectSnapshot?.fullName) {
        continue
      }

      if (item.projectSnapshot.ownerLogin) {
        continue
      }

      await ctx.db.patch(item._id, {
        projectSnapshot: {
          ...item.projectSnapshot,
          ownerLogin: getSnapshotOwnerLogin({
            fallbackProjectId: String(item.projectId),
            fullName: item.projectSnapshot.fullName,
            ownerLoginByProjectId,
          }),
        },
      })
      snapshotsPatched += 1
    }

    const pulseSnapshots = await ctx.db.query('pulse_snapshots').collect()
    for (const snapshot of pulseSnapshots) {
      if (snapshot.projectSnapshot.ownerLogin) {
        continue
      }

      await ctx.db.patch(snapshot._id, {
        projectSnapshot: {
          ...snapshot.projectSnapshot,
          ownerLogin: getSnapshotOwnerLogin({
            fallbackProjectId: snapshot.projectId,
            fullName: snapshot.projectSnapshot.fullName,
            ownerLoginByProjectId,
          }),
        },
      })
      snapshotsPatched += 1
    }

    return {
      projectsPatched,
      snapshotsPatched,
    }
  },
})

async function getPublicProjectDetail(
  ctx: QueryCtx,
  args: {
    owner: string
    repo: string
  },
) {
  const requesterIdentity = await ctx.auth.getUserIdentity()
  const requester = requesterIdentity
    ? await ctx.db
        .query('users')
        .withIndex('by_clerk_id', (query) =>
          query.eq('clerkId', requesterIdentity.subject),
        )
        .unique()
    : null
  const ownerLoginKey = normalizeProjectRouteKey(args.owner)
  const nameKey = normalizeProjectRouteKey(args.repo)
  const matchingProjects = await ctx.db
    .query('projects')
    .withIndex('by_github_route_visible', (query) =>
      query
        .eq('github.ownerLoginKey', ownerLoginKey)
        .eq('github.nameKey', nameKey)
        .eq('locatic.isVisible', true),
    )
    .take(2)
  if (matchingProjects.length > 1) {
    throw new ConvexError('Duplicate visible project route')
  }
  const project = matchingProjects[0] ?? null

  if (!project) {
    return null
  }

  const owner = await ctx.db.get(project.ownerId)
  if (!owner || owner.deletedAt || owner.deactivatedAt) {
    return null
  }

  const releases = await ctx.db
    .query('project_releases')
    .withIndex('by_project_published', (query) =>
      query.eq('projectId', project._id),
    )
    .order('desc')
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
  ).filter((user): user is NonNullable<typeof user> => user !== null)

  const ownerCity = owner.profile.cityId
    ? await ctx.db.get(owner.profile.cityId)
    : null

  return {
    project,
    releases,
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
    canonicalRoute: {
      owner: resolveProjectOwnerLogin(project),
      repo: project.github.name,
    },
  }
}

export const getPublicByRoute = query({
  args: {
    owner: v.string(),
    repo: v.string(),
  },
  returns: projectDetailValidator,
  handler: async (ctx, args) => {
    return await getPublicProjectDetail(ctx, args)
  },
})

export const listLikers = query({
  args: {
    projectId: v.id('projects'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(projectLikerValidator),
  handler: async (ctx, args) => {
    if (!(await getPubliclyInteractableProject(ctx, args.projectId))) {
      return {
        continueCursor: '',
        isDone: true,
        page: [],
        pageStatus: null,
        splitCursor: null,
      }
    }

    const page = await ctx.db
      .query('reactions')
      .withIndex('by_target_reaction_created', (query) =>
        query
          .eq('targetType', 'project')
          .eq('targetId', String(args.projectId))
          .eq('reactionType', 'like'),
      )
      .order('desc')
      .paginate(args.paginationOpts)

    const likers = (
      await Promise.all(
        page.page.map(async (reaction) => {
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
    ).filter((liker): liker is NonNullable<typeof liker> => liker !== null)

    return {
      ...page,
      page: likers,
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
    const now = Date.now()

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
      updatedAt: now,
    })

    await ctx.db.patch(viewer._id, {
      pinnedProfileProjectIds: [...pinnedProjectIds],
      stats: {
        ...viewer.stats,
        projectsCount: nextProjectsCount,
      },
      updatedAt: now,
    })

    if (visibilityChanged && !args.isVisible) {
      const activeContributors = (
        await ctx.db
          .query('project_contributors')
          .withIndex('by_project', (query) =>
            query.eq('projectId', project._id),
          )
          .collect()
      ).filter((contributor) => contributor.isActive)
      const contributorUserIds = new Set(
        activeContributors.map((contributor) => contributor.userId),
      )

      for (const contributor of activeContributors) {
        await ctx.db.patch(contributor._id, {
          isActive: false,
          lastConfirmedAt: now,
        })
      }

      await recomputeContributionCountsForUsers(ctx, contributorUserIds, now)
    }

    if (visibilityChanged && args.isVisible) {
      await ctx.scheduler.runAfter(
        0,
        internal.github_actions.syncProjectContributors,
        { projectId: project._id },
      )
    }

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
    const identity = await requireIdentity(ctx)
    const viewer = await ctx.runMutation(
      internal.users.ensureViewerFromIdentity,
      {
        ...buildViewerSeedFromIdentity(identity),
      },
    )
    if (!viewer) {
      throw new ConvexError('Viewer not found')
    }

    const project = await ctx.runQuery(internal.projects.projectById, {
      projectId: args.projectId,
    })
    if (!project || project.ownerId !== viewer._id) {
      throw new ConvexError('Project not found')
    }
    await enforceRateLimit(ctx, 'githubMetadataRefresh', String(viewer._id))

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
      const ownerLogin =
        repository.ownerLogin || getOwnerLoginFromFullName(repository.fullName)
      const existing = await ctx.db
        .query('projects')
        .withIndex('by_github_repo_id', (query) =>
          query.eq('github.repoId', repository.repoId),
        )
        .unique()

      const projectRecord = {
        github: {
          ...repository,
          ownerLogin,
          ownerLoginKey: normalizeProjectRouteKey(ownerLogin),
          nameKey: normalizeProjectRouteKey(repository.name),
          commitFrequency: getCommitFrequency(repository.lastCommitAt),
        },
        locatic: existing?.locatic ?? {
          isVisible: true,
          tags: normalizeProjectTopics(repository.topics),
          likesCount: 0,
          commentsCount: 0,
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
          lastSyncAttemptedAt: null,
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
        postId: null,
        commentId: null,
        actorSnapshot: {
          displayName: owner.profile.displayName,
          avatarUrl: owner.profile.avatarUrl,
          cityId: owner.profile.cityId,
          cityName: ownerSnapshot.cityName,
        },
        projectSnapshot: buildProjectSnapshot(project),
        postSnapshot: null,
        target: {
          kind: 'project',
          projectId,
          projectSnapshot: buildProjectSnapshot(project),
        },
        createdAt: now,
      })

      const event = await ctx.db.get(eventId)
      if (event) {
        await fanOutActivityEventToFollowers(ctx, event)
      }

      await ctx.scheduler.runAfter(
        (createdProjectIds.length - 1) * 5_000,
        internal.github_actions.syncProjectContributors,
        { projectId },
      )
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
