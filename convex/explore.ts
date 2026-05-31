import { v } from 'convex/values'

import { mutation, query, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { getViewerFromAuth, getViewerOrThrow } from './lib/auth'
import {
  mapBuilderSearchResult,
  mergeBuilderSearchCandidates,
} from './lib/discoverability'
import { buildExploreCandidates, rankNearbyBuilders } from './lib/explore'
import { buildProjectCardPreview } from './lib/project_previews'

const EXPLORE_INDEXES = [
  'by_explore_eligible_likes',
  'by_explore_eligible_comments',
  'by_explore_eligible_stars',
  'by_explore_eligible_last_commit',
  'by_explore_eligible_added',
] as const

const EXPLORE_CITY_INDEXES = [
  'by_explore_city_likes',
  'by_explore_city_comments',
  'by_explore_city_stars',
  'by_explore_city_last_commit',
  'by_explore_city_added',
] as const

function uniqueProjects(projects: Array<Doc<'projects'>>) {
  return [
    ...new Map(
      projects.map((project) => [String(project._id), project]),
    ).values(),
  ]
}

async function fetchGlobalExploreProjects(
  ctx: QueryCtx,
  perIndexLimit: number,
) {
  return uniqueProjects(
    (
      await Promise.all(
        EXPLORE_INDEXES.map((indexName) =>
          ctx.db
            .query('projects')
            .withIndex(indexName, (query) =>
              query.eq('exploreOwner.isEligible', true),
            )
            .order('desc')
            .take(perIndexLimit),
        ),
      )
    ).flat(),
  )
}

async function fetchCityExploreProjects(
  ctx: QueryCtx,
  cityIds: Array<Id<'cities'>>,
  perIndexLimit: number,
) {
  return uniqueProjects(
    (
      await Promise.all(
        cityIds.flatMap((cityId) =>
          EXPLORE_CITY_INDEXES.map((indexName) =>
            ctx.db
              .query('projects')
              .withIndex(indexName, (query) =>
                query
                  .eq('exploreOwner.cityId', cityId)
                  .eq('exploreOwner.isEligible', true),
              )
              .order('desc')
              .take(perIndexLimit),
          ),
        ),
      )
    ).flat(),
  )
}

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
    const perIndexLimit = Math.min(Math.max(limit * 2, 12), 40)
    const [projects, ownedProjects, dismissedProjects] = await Promise.all([
      selectedCityIds.length > 0
        ? fetchCityExploreProjects(ctx, selectedCityIds, perIndexLimit)
        : fetchGlobalExploreProjects(ctx, perIndexLimit),
      ctx.db
        .query('projects')
        .withIndex('by_owner', (query) => query.eq('ownerId', viewer._id))
        .collect(),
      ctx.db
        .query('explore_history')
        .withIndex('by_user_dismissed', (query) =>
          query.eq('userId', viewer._id).gt('dismissedAt', 0),
        )
        .collect(),
    ])
    const dismissedProjectIds = new Set(
      dismissedProjects.map((item) => String(item.projectId)),
    )
    const result = buildExploreCandidates({
      candidates: projects.map((project) => ({
        id: String(project._id),
        cityId: String(project.exploreOwner.cityId),
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

    const ranked = result.flatMap((candidate) => {
      const project = projectById.get(candidate.id)
      return project ? [project] : []
    })
    const ownerById = new Map(
      (
        await Promise.all(
          [...new Set(ranked.map((project) => project.ownerId))].map(
            async (ownerId) =>
              [String(ownerId), await ctx.db.get(ownerId)] as const,
          ),
        )
      ).filter((entry): entry is readonly [string, Doc<'users'>] =>
        Boolean(entry[1]),
      ),
    )

    return {
      scope,
      appliedCityIds: selectedCityIds,
      isCityFiltered: selectedCityIds.length > 0,
      projects: await Promise.all(
        ranked.map((project) =>
          buildProjectCardPreview(ctx.db, project, {
            audience: 'public',
            owner: ownerById.get(String(project.ownerId)),
          }),
        ),
      ),
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

    return mergeBuilderSearchCandidates({
      exactMatch,
      searchResults,
      viewerId: viewer._id,
      cityIds,
      limit,
      excludeViewerId: false,
    }).map(mapBuilderSearchResult)
  },
})

export const listNearbyBuilders = query({
  args: {
    cityIds: v.array(v.id('cities')),
  },
  returns: v.array(
    v.object({
      userId: v.id('users'),
      displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()),
      githubUsername: v.string(),
      cityId: v.union(v.id('cities'), v.null()),
      cityName: v.union(v.string(), v.null()),
      projectsCount: v.number(),
      followersCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const cityIds = Array.from(new Set(args.cityIds))
    if (cityIds.length === 0) return []

    const usersById = new Map<string, Doc<'users'>>()
    const cityEntries = await Promise.all(
      cityIds.map(
        async (cityId): Promise<readonly [string, Doc<'cities'> | null]> =>
          [String(cityId), await ctx.db.get(cityId)] as const,
      ),
    )
    const cityById = new Map(
      cityEntries.filter(
        (entry): entry is readonly [string, Doc<'cities'>] => entry[1] !== null,
      ),
    )
    const cityUsers = await Promise.all(
      cityIds.map((cityId) =>
        ctx.db
          .query('users')
          .withIndex('by_city_explore_rank', (query) =>
            query
              .eq('profile.cityId', cityId)
              .eq('appearInExplore', true)
              .eq('deletedAt', null)
              .eq('deactivatedAt', null),
          )
          .order('desc')
          .take(16),
      ),
    )

    for (const usersInCity of cityUsers) {
      for (const user of usersInCity) {
        if (user._id === viewer._id) {
          continue
        }

        usersById.set(String(user._id), user)
      }
    }

    const rankedUsers = rankNearbyBuilders([...usersById.values()])

    return rankedUsers.map((u) => ({
      userId: u._id,
      displayName: u.profile.displayName,
      avatarUrl: u.profile.avatarUrl ?? null,
      githubUsername: u.github.username,
      projectsCount: u.stats.projectsCount,
      followersCount: u.stats.followersCount,
      cityId: u.profile.cityId,
      cityName: u.profile.cityId
        ? (cityById.get(String(u.profile.cityId))?.displayName ?? null)
        : null,
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
