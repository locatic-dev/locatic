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
    scope: v.optional(
      v.union(v.literal('default'), v.literal('global'), v.literal('custom')),
    ),
    selectedCityIds: v.optional(v.array(v.id('cities'))),
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

        const ownerCityId = owner.profile.cityId ?? project.ownerSnapshot.cityId

        return (
          project.locatic.isVisible &&
          project.ownerId !== viewer._id &&
          ownerCityId !== null &&
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
    const dismissedProjectIds = new Set(
      exploreHistory
        .filter((item) => item.dismissedAt !== null)
        .map((item) => String(item.projectId)),
    )

    const scope = args.scope ?? 'default'
    const defaultCityIds =
      viewer.exploreConfig.cityIds.length > 0
        ? viewer.exploreConfig.cityIds
        : viewer.profile.cityId
          ? [viewer.profile.cityId]
          : []
    const selectedCityIds =
      scope === 'global'
        ? []
        : scope === 'custom'
          ? Array.from(new Set(args.selectedCityIds ?? []))
          : defaultCityIds
    const result = buildExploreCandidates({
      candidates: projects.map((project) => ({
        id: String(project._id),
        cityId: String(
          usersById.get(String(project.ownerId))?.profile.cityId ??
            project.ownerSnapshot.cityId,
        ),
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
      dismissedProjectIds,
      selectedCityIds: new Set(selectedCityIds.map((cityId) => String(cityId))),
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

    return {
      scope,
      appliedCityIds: selectedCityIds,
      isCityFiltered: selectedCityIds.length > 0,
      projects: ranked,
    }
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
  args: {
    cityIds: v.optional(v.array(v.id('cities'))),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const cityIds = Array.from(
      new Set(
        args.cityIds && args.cityIds.length > 0
          ? args.cityIds
          : viewer.profile.cityId
            ? [viewer.profile.cityId]
            : [],
      ),
    )
    if (cityIds.length === 0) return []

    const usersById = new Map()
    const cityUsers = await Promise.all(
      cityIds.map((cityId) =>
        ctx.db
          .query('users')
          .withIndex('by_city_id', (query) =>
            query.eq('profile.cityId', cityId),
          )
          .filter((query) =>
            query.and(
              query.neq(query.field('_id'), viewer._id),
              query.eq(query.field('appearInExplore'), true),
              query.eq(query.field('deletedAt'), null),
              query.eq(query.field('deactivatedAt'), null),
            ),
          )
          .take(8),
      ),
    )

    for (const usersInCity of cityUsers) {
      for (const user of usersInCity) {
        usersById.set(String(user._id), user)
      }
    }

    const rankedUsers = [...usersById.values()]
      .sort((left, right) => {
        if (right.stats.followersCount !== left.stats.followersCount) {
          return right.stats.followersCount - left.stats.followersCount
        }

        if (right.stats.projectsCount !== left.stats.projectsCount) {
          return right.stats.projectsCount - left.stats.projectsCount
        }

        return left.github.username.localeCompare(right.github.username)
      })
      .slice(0, 8)

    return rankedUsers.map((u) => ({
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
