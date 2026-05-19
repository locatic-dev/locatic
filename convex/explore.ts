import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getViewerFromAuth, getViewerOrThrow } from './lib/auth'
import {
  matchesBuilderSearchQuery,
  mapBuilderSearchResult,
  mergeBuilderSearchCandidates,
} from './lib/discoverability'
import { buildExploreCandidates } from './lib/explore'

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const limit = Math.min(args.limit ?? 20, 50)
    const users = await ctx.db.query('users').collect()
    const usersById = new Map(users.map((user) => [String(user._id), user]))
    const ownedProjects = await ctx.db
      .query('projects')
      .withIndex('by_owner', (query) => query.eq('ownerId', viewer._id))
      .collect()

    const projects = (await ctx.db.query('projects').collect()).filter(
      (project) => {
        const owner = usersById.get(String(project.ownerId))
        if (!owner) {
          return false
        }

        return (
          project.locatic.isVisible &&
          project.ownerId !== viewer._id &&
          project.ownerSnapshot.cityId !== null &&
          owner.appearInExplore &&
          !owner.deletedAt &&
          !owner.deactivatedAt
        )
      },
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

    const ranked = result
      .map((candidate) => projectById.get(candidate.id))
      .filter(Boolean)

    const isCityFiltered =
      viewer.exploreConfig.cityIds.length > 0 || Boolean(viewer.profile.cityId)

    // When city-filtered results are empty, include globally recent projects
    // the viewer hasn't dismissed — so the feed is never completely blank.
    const fallback =
      ranked.length === 0
        ? (await ctx.db.query('projects').collect())
            .filter((p) => {
              const owner = usersById.get(String(p.ownerId))
              return (
                p.locatic.isVisible &&
                p.ownerId !== viewer._id &&
                owner?.appearInExplore &&
                !owner?.deletedAt &&
                !owner?.deactivatedAt &&
                !exploreHistory.some(
                  (h) =>
                    String(h.projectId) === String(p._id) &&
                    h.dismissedAt != null,
                )
              )
            })
            .sort((a, b) => b.addedToLocaticAt - a.addedToLocaticAt)
            .slice(0, 10)
        : []

    return { projects: ranked, fallback, isCityFiltered }
  },
})

export const searchBuilders = query({
  args: {
    q: v.string(),
    cityIds: v.optional(v.array(v.id('cities'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalizedQ = args.q.trim().toLowerCase()
    if (!normalizedQ) return []
    const viewer = await getViewerFromAuth(ctx)
    if (!viewer) {
      return []
    }
    const limit = Math.min(args.limit ?? 10, 20)
    const cityIds = (args.cityIds ?? []).map(String)

    const exactMatch = await ctx.db
      .query('users')
      .withIndex('by_github_username', (q) =>
        q.eq('github.username', normalizedQ),
      )
      .first()

    const searchResults = await ctx.db
      .query('users')
      .withSearchIndex('search_identity', (q) =>
        q
          .search('discoverability.searchText', normalizedQ)
          .eq('appearInExplore', true)
          .eq('deletedAt', null)
          .eq('deactivatedAt', null),
      )
      .take(cityIds.length > 0 ? limit * 5 : limit * 3)

    const fallbackMatches =
      searchResults.length > 0
        ? []
        : (
            await ctx.db
              .query('users')
              .filter((q) =>
                q.and(
                  q.eq(q.field('appearInExplore'), true),
                  q.eq(q.field('deletedAt'), null),
                  q.eq(q.field('deactivatedAt'), null),
                ),
              )
              // Transitional rollout fallback for older rows whose search text
              // has not been backfilled yet. Collect the full discoverable set
              // so exact name matches are not lost to arbitrary table slices.
              .collect()
          ).filter((candidate) =>
            matchesBuilderSearchQuery(candidate, normalizedQ),
          )

    return mergeBuilderSearchCandidates({
      exactMatch,
      searchResults: [...searchResults, ...fallbackMatches],
      viewerId: viewer._id,
      cityIds,
      limit,
      excludeViewerId: false,
    }).map(mapBuilderSearchResult)
  },
})

export const listNearbyBuilders = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const cityId = viewer.profile.cityId
    if (!cityId) return []

    const cityUsers = await ctx.db
      .query('users')
      .withIndex('by_city_id', (q) => q.eq('profile.cityId', cityId))
      .filter((q) =>
        q.and(
          q.neq(q.field('_id'), viewer._id),
          q.eq(q.field('appearInExplore'), true),
          q.eq(q.field('deletedAt'), null),
          q.eq(q.field('deactivatedAt'), null),
        ),
      )
      .take(8)

    return cityUsers.map((u) => ({
      userId: u._id,
      displayName: u.profile.displayName,
      avatarUrl: u.profile.avatarUrl ?? null,
      githubUsername: u.github.username,
      projectsCount: u.stats.projectsCount,
      followersCount: u.stats.followersCount,
    }))
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
