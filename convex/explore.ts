import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { buildExploreCandidates } from './lib/explore'

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const limit = Math.min(args.limit ?? 20, 50)
    const ownedProjects = await ctx.db
      .query('projects')
      .withIndex('by_owner', (query) => query.eq('ownerId', viewer._id))
      .collect()

    const projects = (await ctx.db.query('projects').collect()).filter(
      (project) =>
        project.locatic.isVisible &&
        project.ownerId !== viewer._id &&
        project.ownerSnapshot.cityId !== null,
    )

    const exploreHistory = await ctx.db
      .query('explore_history')
      .withIndex('by_user_last_seen', (query) => query.eq('userId', viewer._id))
      .collect()

    const result = buildExploreCandidates({
      candidates: projects.map((project) => ({
        id: String(project._id),
        cityId: String(project.ownerSnapshot.cityId),
        primaryLanguage: project.github.primaryLanguage,
        topics: project.github.topics,
        likesCount: project.locatic.likesCount,
        commentsCount: project.locatic.commentsCount,
        stargazersCount: project.github.stargazersCount,
        lastCommitAt: project.github.lastCommitAt,
        addedToLocaticAt: project.addedToLocaticAt,
      })),
      ownedProjectIds: new Set(
        ownedProjects.map((project) => String(project._id)),
      ),
      seenProjectIds: new Set(
        exploreHistory.map((item) => String(item.projectId)),
      ),
      selectedCityIds: new Set(
        (viewer.exploreConfig.cityIds.length > 0
          ? viewer.exploreConfig.cityIds
          : viewer.profile.cityId
            ? [viewer.profile.cityId]
            : []
        ).map((cityId) => String(cityId)),
      ),
      stackPrefs: viewer.exploreConfig.stackPrefs,
      now: Date.now(),
      limit,
    })

    const projectById = new Map(
      projects.map((project) => [String(project._id), project]),
    )

    return result
      .map((candidate) => projectById.get(candidate.id))
      .filter(Boolean)
  },
})

export const dismiss = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const existing = await ctx.db
      .query('explore_history')
      .withIndex('by_user_project', (query) =>
        query.eq('userId', viewer._id).eq('projectId', args.projectId),
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: Date.now(),
        dismissedAt: Date.now(),
      })
      return existing._id
    }

    return await ctx.db.insert('explore_history', {
      userId: viewer._id,
      projectId: args.projectId,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      dismissedAt: Date.now(),
      likedAt: null,
    })
  },
})
