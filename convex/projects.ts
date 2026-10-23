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
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { enqueueActivityEventFanOut } from './lib/homeFeed'
import { getPubliclyInteractableProject } from './lib/project_access'
import {
  buildViewerSeedFromIdentity,
  getViewerFromAuth,
  getViewerOrThrow,
  requireIdentity,
} from './lib/auth'
import { buildPostSearchText } from './lib/posts'
import { canPinProject } from './lib/project_pins'
import {
  buildProjectCardPreview,
  buildProjectCardSignals,
  projectCardPreviewValidator,
  projectCardSignalsFields,
  resolvePublicCityLabel,
} from './lib/project_previews'
import {
  getOwnerLoginFromFullName,
  normalizeProjectRouteKey,
  resolveProjectOwnerLogin,
} from './lib/project_route'
import {
  buildActorSnapshot,
  buildOwnerSnapshot,
  buildProjectExploreOwner,
  buildProjectSnapshot,
  isOwnerDiscoverable,
} from './lib/snapshots'
import { createCityStatsChanges, getProjectCityId } from './lib/cityStats'
import {
  computeLastPublicActivityAt,
  raiseLastPublicActivity,
  recomputeLastPublicActivityIfLatest,
  recomputeProjectPublicActivity,
  withLastPublicActivity,
} from './lib/activity'
import { recomputeContributionCountsForUsers } from './lib/project_contributor_sync'
import { normalizeProjectTopics } from './lib/topics'
import {
  buildStatusValidator,
  optionalStringValidator,
  optionalTimestampValidator,
  socialLinksValidator,
} from './lib/validators'
import { enforceRateLimit } from './lib/rate_limits'
import {
  getProjectReactionCounts,
  getViewerReactionTypesByTargetId,
} from './lib/reactions'
import { isCityMember, resolveLocationDisclosure } from './lib/visibility'
import { countMetric } from './metrics'

/** Size of the "more from {city}" list on the project page. */
const MORE_FROM_CITY_LIMIT = 6
/** Rows read for "more from": the limit, the project itself and 5 spares. */
const MORE_FROM_CITY_READ_LIMIT = MORE_FROM_CITY_LIMIT + 6

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

const publicProjectDetailValidator = v.object({
  _id: v.id('projects'),
  _creationTime: v.number(),
  github: v.object({
    fullName: v.string(),
    description: optionalStringValidator,
    primaryLanguage: optionalStringValidator,
    languages: v.array(v.object({ name: v.string(), bytes: v.number() })),
    topics: v.array(v.string()),
    stargazersCount: v.number(),
    lastCommitAt: v.number(),
    readmePreview: optionalStringValidator,
    readmeAssetBaseUrl: optionalStringValidator,
    readmeAssetRootUrl: optionalStringValidator,
    readmeLinkBaseUrl: optionalStringValidator,
    readmeLinkRootUrl: optionalStringValidator,
  }),
  locatic: v.object({
    tags: v.array(v.string()),
    commentsCount: v.number(),
    postsCount: v.number(),
  }),
})

const publicProjectReleaseValidator = v.object({
  _id: v.id('project_releases'),
  _creationTime: v.number(),
  projectId: v.id('projects'),
  githubReleaseId: v.number(),
  tagName: v.string(),
  name: optionalStringValidator,
  body: optionalStringValidator,
  htmlUrl: v.string(),
  isDraft: v.boolean(),
  isPrerelease: v.boolean(),
  publishedAt: optionalTimestampValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  importedAt: v.number(),
})

const projectDetailValidator = v.union(
  v.object({
    project: publicProjectDetailValidator,
    releases: v.array(publicProjectReleaseValidator),
    viewerHasLiked: v.boolean(),
    reactionCounts: v.record(v.string(), v.number()),
    viewerReactionTypes: v.array(v.string()),
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

function toPublicProjectDetail(project: Doc<'projects'>) {
  return {
    _id: project._id,
    _creationTime: project._creationTime,
    github: {
      fullName: project.github.fullName,
      description: project.github.description,
      primaryLanguage: project.github.primaryLanguage,
      languages: project.github.languages,
      topics: project.github.topics,
      stargazersCount: project.github.stargazersCount,
      lastCommitAt: project.github.lastCommitAt,
      readmePreview: project.github.readmePreview,
      readmeAssetBaseUrl: project.github.readmeAssetBaseUrl,
      readmeAssetRootUrl: project.github.readmeAssetRootUrl,
      readmeLinkBaseUrl: project.github.readmeLinkBaseUrl,
      readmeLinkRootUrl: project.github.readmeLinkRootUrl,
    },
    locatic: {
      tags: project.locatic.tags,
      commentsCount: project.locatic.commentsCount,
      postsCount: project.locatic.postsCount ?? 0,
    },
  }
}

function toPublicProjectRelease(release: Doc<'project_releases'>) {
  return {
    _id: release._id,
    _creationTime: release._creationTime,
    projectId: release.projectId,
    githubReleaseId: release.githubReleaseId,
    tagName: release.tagName,
    name: release.name,
    body: release.body,
    htmlUrl: release.htmlUrl,
    isDraft: release.isDraft,
    isPrerelease: release.isPrerelease,
    publishedAt: release.publishedAt,
    createdAt: release.createdAt,
    updatedAt: release.updatedAt,
    importedAt: release.importedAt,
  }
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

  const viewerReactionTypes =
    (
      await getViewerReactionTypesByTargetId(ctx, requester, {
        targetIds: [String(project._id)],
        targetType: 'project',
      })
    ).get(String(project._id)) ?? []

  const viewerFollowsOwner = requester
    ? await ctx.db
        .query('follows')
        .withIndex('by_pair', (query) =>
          query.eq('followerId', requester._id).eq('followingId', owner._id),
        )
        .unique()
    : null

  const ownerCity = owner.profile.cityId
    ? await ctx.db.get(owner.profile.cityId)
    : null

  return {
    project: toPublicProjectDetail(project),
    releases: releases.map(toPublicProjectRelease),
    reactionCounts: getProjectReactionCounts(project),
    viewerHasLiked: viewerReactionTypes.includes('like'),
    viewerReactionTypes,
    viewerFollowsOwner: Boolean(viewerFollowsOwner),
    owner: {
      userId: owner._id,
      githubUsername: owner.github.username,
      displayName: owner.profile.displayName,
      avatarUrl: owner.profile.avatarUrl,
      socialLinks: owner.profile.socialLinks,
      buildStatus: owner.profile.buildStatus,
      city: resolvePublicCityLabel(owner, ownerCity),
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

async function getVisibleProjectWithOwner(
  ctx: QueryCtx,
  projectId: Id<'projects'>,
) {
  const project = await ctx.db.get(projectId)
  if (!project || !project.locatic.isVisible) {
    return null
  }

  const owner = await ctx.db.get(project.ownerId)
  if (!owner || owner.deletedAt || owner.deactivatedAt) {
    return null
  }

  return { owner, project }
}

/**
 * Latest update, sync freshness, owner location and collaboration status for
 * the project page header. The owner also gets a failed refresh and its reason.
 */
export const getProjectSignals = query({
  args: { projectId: v.id('projects') },
  returns: v.union(v.object(projectCardSignalsFields), v.null()),
  handler: async (ctx, args) => {
    const resolved = await getVisibleProjectWithOwner(ctx, args.projectId)
    if (!resolved) {
      return null
    }

    const viewer = await getViewerFromAuth(ctx)
    const ownerCity = resolved.owner.profile.cityId
      ? await ctx.db.get(resolved.owner.profile.cityId)
      : null

    return await buildProjectCardSignals(ctx.db, resolved.project, {
      audience: 'public',
      owner: resolved.owner,
      ownerCity,
      viewerId: viewer?._id ?? null,
    })
  },
})

/**
 * Other discoverable projects from the owner's city, most recently pushed
 * first. Only for owners who disclose their exact city (plan decision D8);
 * region-only and hidden owners get null. One bounded index read.
 */
export const listMoreFromOwnerCity = query({
  args: { projectId: v.id('projects') },
  returns: v.union(
    v.object({
      cityId: v.id('cities'),
      cityName: v.string(),
      projects: v.array(projectCardPreviewValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const resolved = await getVisibleProjectWithOwner(ctx, args.projectId)
    if (!resolved) {
      return null
    }

    const ownerCity = resolved.owner.profile.cityId
      ? await ctx.db.get(resolved.owner.profile.cityId)
      : null
    const location = resolveLocationDisclosure(resolved.owner, ownerCity)
    if (location.kind !== 'city') {
      return null
    }

    // `exploreOwner.cityId` is set only for exact-city members and
    // `isEligible` only for visible projects of active owners who appear in
    // Explore, so this read applies the same rules as city discovery. Rows
    // written before an owner's latest change was re-derived can still name
    // the city, so the live owner must also be a discoverable member of it;
    // the read takes a few spare rows for those.
    const nearby = await ctx.db
      .query('projects')
      .withIndex('by_explore_city_last_commit', (query) =>
        query
          .eq('exploreOwner.cityId', location.cityId)
          .eq('exploreOwner.isEligible', true),
      )
      .order('desc')
      .take(MORE_FROM_CITY_READ_LIMIT)
    const candidates = nearby.filter(
      (project) => project._id !== resolved.project._id,
    )
    const owners = await Promise.all(
      candidates.map((project) =>
        project.ownerId === resolved.owner._id
          ? Promise.resolve(resolved.owner)
          : ctx.db.get(project.ownerId),
      ),
    )
    const viewer = await getViewerFromAuth(ctx)
    const projects = await Promise.all(
      candidates
        .flatMap((project, index) => {
          const owner = owners[index]
          return owner &&
            isOwnerDiscoverable(owner) &&
            isCityMember(owner, location.cityId)
            ? [{ project, owner }]
            : []
        })
        .slice(0, MORE_FROM_CITY_LIMIT)
        .map(({ project, owner }) =>
          buildProjectCardPreview(ctx.db, project, {
            audience: 'public',
            owner,
            signals: { viewerId: viewer?._id ?? null },
          }),
        ),
    )

    return {
      cityId: location.cityId,
      // The short name reads as a heading ("more from Bengaluru").
      cityName: ownerCity?.name ?? location.cityName,
      projects,
    }
  },
})

export const getViewerReactionTypes = query({
  args: { projectId: v.id('projects') },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const viewer = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (query) =>
        query.eq('clerkId', identity.subject),
      )
      .unique()
    if (!viewer) return []
    return (
      (
        await getViewerReactionTypesByTargetId(ctx, viewer, {
          targetIds: [String(args.projectId)],
          targetType: 'project',
        })
      ).get(String(args.projectId)) ?? []
    )
  },
})

export const backfillProjectReactionCounts = internalMutation({
  args: {
    afterProjectCreationTime: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
    activeProject: v.optional(
      v.object({
        projectId: v.id('projects'),
        projectCreationTime: v.number(),
        reactionCursor: v.union(v.string(), v.null()),
        reactionCounts: v.record(v.string(), v.number()),
      }),
    ),
    totals: v.optional(
      v.object({
        likeMismatches: v.number(),
        patched: v.number(),
        scanned: v.number(),
      }),
    ),
  },
  returns: v.object({
    nextProjectCreationTime: v.union(v.number(), v.null()),
    likeMismatches: v.number(),
    patched: v.number(),
    scanned: v.number(),
    scheduledContinuation: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 250, 1), 250)
    let patched = args.totals?.patched ?? 0
    let likeMismatches = args.totals?.likeMismatches ?? 0
    let scanned = args.totals?.scanned ?? 0
    let activeProject = args.activeProject

    if (!activeProject) {
      const project = await ctx.db
        .query('projects')
        .withIndex('by_creation_time', (query) =>
          args.afterProjectCreationTime == null
            ? query
            : query.gt('_creationTime', args.afterProjectCreationTime),
        )
        .first()

      if (!project) {
        const totals = { likeMismatches, patched, scanned }
        console.info(
          'Project reaction-count backfill complete',
          JSON.stringify(totals),
        )
        return {
          nextProjectCreationTime: null,
          ...totals,
          scheduledContinuation: false,
        }
      }

      scanned += 1
      if (project.locatic.reactionCounts !== undefined) {
        const totals = { likeMismatches, patched, scanned }
        await ctx.scheduler.runAfter(
          0,
          internal.projects.backfillProjectReactionCounts,
          {
            afterProjectCreationTime: project._creationTime,
            limit,
            totals,
          },
        )
        return {
          nextProjectCreationTime: project._creationTime,
          ...totals,
          scheduledContinuation: true,
        }
      }

      activeProject = {
        projectId: project._id,
        projectCreationTime: project._creationTime,
        reactionCursor: null,
        reactionCounts: {},
      }
    }

    const project = await ctx.db.get(activeProject.projectId)
    if (!project || project.locatic.reactionCounts !== undefined) {
      const totals = { likeMismatches, patched, scanned }
      await ctx.scheduler.runAfter(
        0,
        internal.projects.backfillProjectReactionCounts,
        {
          afterProjectCreationTime: activeProject.projectCreationTime,
          limit,
          totals,
        },
      )
      return {
        nextProjectCreationTime: activeProject.projectCreationTime,
        ...totals,
        scheduledContinuation: true,
      }
    }

    const reactionPage = await ctx.db
      .query('reactions')
      .withIndex('by_target', (query) =>
        query.eq('targetType', 'project').eq('targetId', String(project._id)),
      )
      .paginate({
        cursor: activeProject.reactionCursor,
        numItems: limit,
        maximumRowsRead: limit,
        maximumBytesRead: 2_000_000,
      })
    const reactionCounts = { ...activeProject.reactionCounts }
    for (const reaction of reactionPage.page) {
      reactionCounts[reaction.reactionType] =
        (reactionCounts[reaction.reactionType] ?? 0) + 1
    }

    if (!reactionPage.isDone) {
      const totals = { likeMismatches, patched, scanned }
      await ctx.scheduler.runAfter(
        0,
        internal.projects.backfillProjectReactionCounts,
        {
          limit,
          totals,
          activeProject: {
            ...activeProject,
            reactionCursor: reactionPage.continueCursor,
            reactionCounts,
          },
        },
      )
      return {
        nextProjectCreationTime: activeProject.projectCreationTime,
        ...totals,
        scheduledContinuation: true,
      }
    }

    if ((reactionCounts.like ?? 0) !== project.locatic.likesCount) {
      likeMismatches += 1
    }
    reactionCounts.like = project.locatic.likesCount
    await ctx.db.patch(project._id, {
      locatic: { ...project.locatic, reactionCounts },
    })
    patched += 1

    const totals = { likeMismatches, patched, scanned }

    console.info(
      'Project reaction-count backfill batch',
      JSON.stringify({
        ...totals,
        projectId: project._id,
        reactionRows: reactionPage.page.length,
        scheduledContinuation: true,
      }),
    )

    await ctx.scheduler.runAfter(
      0,
      internal.projects.backfillProjectReactionCounts,
      {
        afterProjectCreationTime: activeProject.projectCreationTime,
        limit,
        totals,
      },
    )

    return {
      nextProjectCreationTime: activeProject.projectCreationTime,
      ...totals,
      scheduledContinuation: true,
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

    const exploreOwner = buildProjectExploreOwner(viewer, args.isVisible)
    const cityStats = createCityStatsChanges()
    await cityStats.moveProject(ctx.db, project, project, { exploreOwner })

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        isVisible: args.isVisible,
      },
      exploreOwner,
      updatedAt: now,
    })
    await cityStats.apply(ctx.db)

    // Activity signal (plan item D4): a project turning visible brings its
    // commits, posts and releases into public work; turning hidden takes them
    // out, recomputed after the patch above so this project no longer counts.
    const visibilityStats = {
      ...viewer.stats,
      projectsCount: nextProjectsCount,
    }
    const projectActivityAt = visibilityChanged
      ? await recomputeProjectPublicActivity(ctx.db, project._id)
      : null
    const nextStats =
      projectActivityAt === null
        ? visibilityStats
        : args.isVisible
          ? raiseLastPublicActivity(visibilityStats, projectActivityAt, now)
          : await recomputeLastPublicActivityIfLatest(
              ctx.db,
              { _id: viewer._id, stats: visibilityStats },
              projectActivityAt,
            )

    await ctx.db.patch(viewer._id, {
      pinnedProfileProjectIds: [...pinnedProjectIds],
      stats: nextStats,
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
    if (!owner || owner.deletedAt != null || owner.purgedAt != null) {
      throw new ConvexError('Owner not found')
    }

    const [ownerSnapshot, actorSnapshot] = await Promise.all([
      buildOwnerSnapshot(ctx.db, owner),
      buildActorSnapshot(ctx.db, owner),
    ])
    const cityStats = createCityStatsChanges()
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
          lastPublicActivityAt: Math.min(repository.lastCommitAt, now),
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

        await cityStats.moveProject(ctx.db, existing, existing, projectRecord)
        // The import may carry a newer commit than the stored row.
        cityStats.recordActivity(
          getProjectCityId(projectRecord),
          Math.min(repository.lastCommitAt, now),
        )
        await ctx.db.patch(existing._id, projectRecord)
        await recomputeProjectPublicActivity(ctx.db, existing._id)
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
      await cityStats.moveProject(ctx.db, project, null, project)

      const eventId = await ctx.db.insert('activity_events', {
        actorId: owner._id,
        eventType: 'project_posted',
        projectId,
        postId: null,
        commentId: null,
        actorSnapshot,
        projectSnapshot: buildProjectSnapshot(project),
        postSnapshot: null,
        target: {
          kind: 'project',
          projectId,
          projectSnapshot: buildProjectSnapshot(project),
        },
        createdAt: now,
      })

      await enqueueActivityEventFanOut(ctx, eventId)

      await ctx.scheduler.runAfter(
        (createdProjectIds.length - 1) * 5_000,
        internal.github_actions.syncProjectContributors,
        { projectId },
      )
    }

    const activityAt = await computeLastPublicActivityAt(ctx.db, owner._id, now)
    await ctx.db.patch(owner._id, {
      stats: withLastPublicActivity(
        {
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
        activityAt,
      ),
      githubLastSyncedAt: now,
      updatedAt: now,
    })

    await cityStats.apply(ctx.db)

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

// ---------------------------------------------------------------------------
// Saves (plan item D1): a private bookmark list. Rows are readable only by the
// user who saved them; there are no folders, tags or sharing.
// ---------------------------------------------------------------------------

/** Most project ids one `getSavedState` call accepts (a page of cards). */
const SAVED_STATE_MAX_IDS = 40

const savedProjectValidator = v.object({
  savedAt: v.number(),
  project: projectCardPreviewValidator,
})

async function getSavedRow(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  projectId: Id<'projects'>,
) {
  return await ctx.db
    .query('saved_projects')
    .withIndex('by_user_project', (query) =>
      query.eq('userId', userId).eq('projectId', projectId),
    )
    .first()
}

/** Idempotent: saving a saved project changes nothing. */
export const save = mutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    if (!(await getPubliclyInteractableProject(ctx, args.projectId))) {
      throw new ConvexError('Project not found')
    }
    if (await getSavedRow(ctx, viewer._id, args.projectId)) {
      return null
    }
    await enforceRateLimit(ctx, 'saveWrite', String(viewer._id))

    await ctx.db.insert('saved_projects', {
      userId: viewer._id,
      projectId: args.projectId,
      createdAt: Date.now(),
    })
    await countMetric(ctx, 'save')
    return null
  },
})

/**
 * Idempotent, and works for projects that have since been hidden so a user
 * can always clear their own rows.
 */
export const unsave = mutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const existing = await getSavedRow(ctx, viewer._id, args.projectId)
    if (existing) {
      await ctx.db.delete(existing._id)
    }
    return null
  },
})

/**
 * The viewer's saved projects, most recently saved first. One paginate over
 * the viewer's own index range, so no other user's rows are reachable. Saves
 * of projects that are hidden or whose owner left are skipped (a page can be
 * shorter than requested); the row stays so the save returns if the project
 * becomes visible again.
 */
export const listSaved = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(savedProjectValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const result = await ctx.db
      .query('saved_projects')
      .withIndex('by_user_created', (query) => query.eq('userId', viewer._id))
      .order('desc')
      .paginate(args.paginationOpts)

    const page = await Promise.all(
      result.page.map(async (row) => {
        const resolved = await getVisibleProjectWithOwner(ctx, row.projectId)
        if (!resolved) {
          return null
        }

        return {
          savedAt: row.createdAt,
          project: await buildProjectCardPreview(ctx.db, resolved.project, {
            audience: resolved.owner._id === viewer._id ? 'private' : 'public',
            owner: resolved.owner,
            signals: { viewerId: viewer._id },
          }),
        }
      }),
    )

    return {
      ...result,
      page: page.filter((entry) => entry !== null),
    }
  },
})

/**
 * Which of the given projects the viewer has saved, for Save toggles on a
 * page of cards. At most `SAVED_STATE_MAX_IDS` ids, one indexed point read
 * each. Signed-out visitors get an empty list.
 */
export const getSavedState = query({
  args: { projectIds: v.array(v.id('projects')) },
  returns: v.array(v.id('projects')),
  handler: async (ctx, args) => {
    const projectIds = [...new Set(args.projectIds)]
    if (projectIds.length > SAVED_STATE_MAX_IDS) {
      throw new ConvexError(
        `Ask for at most ${SAVED_STATE_MAX_IDS} projects at a time`,
      )
    }

    const viewer = await getViewerFromAuth(ctx)
    if (!viewer || projectIds.length === 0) {
      return []
    }

    const rows = await Promise.all(
      projectIds.map((projectId) => getSavedRow(ctx, viewer._id, projectId)),
    )
    return rows.flatMap((row) => (row ? [row.projectId] : []))
  },
})
