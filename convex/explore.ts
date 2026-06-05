import { v } from 'convex/values'

import { mutation, query, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { getViewerFromAuth, getViewerOrThrow } from './lib/auth'
import { mergeBuilderSearchCandidates } from './lib/discoverability'
import { buildExploreCandidates, rankNearbyBuilders } from './lib/explore'
import { buildProjectCardPreview } from './lib/project_previews'
import { getProjectTopics } from './lib/topics'
import { filterVisiblePosts, normalizePostSearchQuery } from './lib/posts'

const projectSearchResultValidator = v.object({
  projectId: v.id('projects'),
  ownerUserId: v.id('users'),
  fullName: v.string(),
  owner: v.string(),
  repo: v.string(),
  description: v.union(v.string(), v.null()),
  primaryLanguage: v.union(v.string(), v.null()),
  languages: v.array(
    v.object({
      name: v.string(),
      bytes: v.number(),
    }),
  ),
  githubStars: v.number(),
  locaticLikes: v.number(),
  commentsCount: v.number(),
  postsCount: v.number(),
  topics: v.array(v.string()),
  lastCommitAt: v.number(),
  updatedAt: v.number(),
  authorName: v.string(),
  authorHandle: v.string(),
  authorAvatarUrl: v.union(v.string(), v.null()),
  cityLabel: v.union(v.string(), v.null()),
  cityVisibilityState: v.union(
    v.literal('exact_city'),
    v.literal('region_only'),
    v.literal('hidden'),
    v.literal('unset'),
  ),
})

const postSearchResultValidator = v.object({
  _id: v.id('posts'),
  _creationTime: v.number(),
  projectId: v.id('projects'),
  ownerId: v.id('users'),
  actorId: v.id('users'),
  authorRole: v.union(
    v.literal('owner'),
    v.literal('collaborator'),
    v.literal('contributor'),
  ),
  body: v.string(),
  searchText: v.optional(v.string()),
  reactionCounts: v.record(v.string(), v.number()),
  commentsCount: v.number(),
  projectCityId: v.union(v.id('cities'), v.null()),
  projectTopics: v.array(v.string()),
  actorSnapshot: v.object({
    displayName: v.string(),
    avatarUrl: v.string(),
    cityId: v.union(v.id('cities'), v.null()),
    cityName: v.union(v.string(), v.null()),
  }),
  projectSnapshot: v.object({
    name: v.string(),
    fullName: v.string(),
    primaryLanguage: v.union(v.string(), v.null()),
    languages: v.array(
      v.object({
        name: v.string(),
        bytes: v.number(),
      }),
    ),
  }),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
})

const builderSearchResultValidator = v.object({
  userId: v.id('users'),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  githubUsername: v.string(),
  cityId: v.union(v.id('cities'), v.null()),
  cityName: v.union(v.string(), v.null()),
  projectsCount: v.number(),
  followersCount: v.number(),
})

const exploreFeedResultValidator = v.object({
  scope: v.union(
    v.literal('default'),
    v.literal('global'),
    v.literal('custom'),
  ),
  appliedCityIds: v.array(v.id('cities')),
  isCityFiltered: v.boolean(),
  projects: v.array(projectSearchResultValidator),
})

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

async function getCityByIdMap(ctx: QueryCtx, cityIds: Array<Id<'cities'>>) {
  const entries = await Promise.all(
    [...new Set(cityIds.map(String))].map(async (cityId) => {
      const normalizedCityId = ctx.db.normalizeId('cities', cityId)
      return [
        cityId,
        normalizedCityId ? await ctx.db.get(normalizedCityId) : null,
      ] as const
    }),
  )

  return new Map(
    entries.filter(
      (entry): entry is readonly [string, Doc<'cities'>] => entry[1] !== null,
    ),
  )
}

function mapBuilderPreview(
  user: Doc<'users'>,
  cityById: Map<string, Doc<'cities'>>,
) {
  return {
    userId: user._id,
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl ?? null,
    githubUsername: user.github.username,
    projectsCount: user.stats.projectsCount,
    followersCount: user.stats.followersCount,
    cityId: user.profile.cityId,
    cityName: user.profile.cityId
      ? (cityById.get(String(user.profile.cityId))?.displayName ?? null)
      : null,
  }
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
  returns: exploreFeedResultValidator,
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
        topics: getProjectTopics(project),
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
  returns: v.array(builderSearchResultValidator),
  handler: async (ctx, args) => {
    const normalizedQ = normalizePostSearchQuery(args.q)
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

    const builders = mergeBuilderSearchCandidates({
      exactMatch,
      searchResults,
      viewerId: viewer._id,
      cityIds,
      limit,
      excludeViewerId: false,
    })
    const cityById = await getCityByIdMap(
      ctx,
      builders
        .map((builder) => builder.profile.cityId)
        .filter((cityId): cityId is Id<'cities'> => Boolean(cityId)),
    )

    return builders.map((builder) => mapBuilderPreview(builder, cityById))
  },
})

export const searchProjects = query({
  args: {
    q: v.string(),
    cityIds: v.optional(v.array(v.id('cities'))),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    projectResultScope: v.literal('recent'),
    projects: v.array(projectSearchResultValidator),
  }),
  handler: async (ctx, args) => {
    const viewer = await getViewerFromAuth(ctx)
    if (!viewer) {
      return { projectResultScope: 'recent' as const, projects: [] }
    }

    const normalizedQ = args.q.trim().toLowerCase()
    if (!normalizedQ) {
      return { projectResultScope: 'recent' as const, projects: [] }
    }

    const limit = Math.min(args.limit ?? 10, 20)
    const cityIds = new Set((args.cityIds ?? []).map(String))
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_explore_eligible_added', (query) =>
        query.eq('exploreOwner.isEligible', true),
      )
      .order('desc')
      .take(cityIds.size > 0 ? limit * 8 : limit * 5)
    const matchingProjects = projects
      .filter((project) => {
        if (
          cityIds.size > 0 &&
          (!project.exploreOwner.cityId ||
            !cityIds.has(String(project.exploreOwner.cityId)))
        ) {
          return false
        }

        const searchText = [
          project.github.fullName,
          project.github.description ?? '',
          project.github.primaryLanguage ?? '',
          ...getProjectTopics(project),
        ]
          .join(' ')
          .toLowerCase()

        return searchText.includes(normalizedQ)
      })
      .slice(0, limit)

    const ownerById = new Map(
      (
        await Promise.all(
          [...new Set(matchingProjects.map((project) => project.ownerId))].map(
            async (ownerId) =>
              [String(ownerId), await ctx.db.get(ownerId)] as const,
          ),
        )
      ).filter((entry): entry is readonly [string, Doc<'users'>] =>
        Boolean(entry[1]),
      ),
    )

    return {
      projectResultScope: 'recent' as const,
      projects: await Promise.all(
        matchingProjects.map((project) =>
          buildProjectCardPreview(ctx.db, project, {
            audience: 'public',
            owner: ownerById.get(String(project.ownerId)),
          }),
        ),
      ),
    }
  },
})

export const searchPosts = query({
  args: {
    q: v.string(),
    cityIds: v.optional(v.array(v.id('cities'))),
    limit: v.optional(v.number()),
  },
  returns: v.array(postSearchResultValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerFromAuth(ctx)
    if (!viewer) {
      return []
    }

    const normalizedQ = args.q.trim().toLowerCase()
    if (!normalizedQ) {
      return []
    }

    const limit = Math.min(args.limit ?? 10, 20)
    const cityIds = new Set((args.cityIds ?? []).map(String))
    const cityIdValues = [...cityIds].flatMap((cityId) => {
      const normalizedCityId = ctx.db.normalizeId('cities', cityId)
      return normalizedCityId ? [normalizedCityId] : []
    })
    const posts =
      cityIdValues.length > 0
        ? (
            await Promise.all(
              cityIdValues.map((cityId) =>
                ctx.db
                  .query('posts')
                  .withSearchIndex('search_text', (query) =>
                    query
                      .search('searchText', normalizedQ)
                      .eq('deletedAt', null)
                      .eq('projectCityId', cityId),
                  )
                  .take(limit),
              ),
            )
          ).flat()
        : await ctx.db
            .query('posts')
            .withSearchIndex('search_text', (query) =>
              query.search('searchText', normalizedQ).eq('deletedAt', null),
            )
            .take(limit)

    return (await filterVisiblePosts(ctx, posts)).slice(0, limit)
  },
})

export const listNearbyBuilders = query({
  args: {
    cityIds: v.array(v.id('cities')),
  },
  returns: v.array(builderSearchResultValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const cityIds = Array.from(new Set(args.cityIds))

    const usersById = new Map<string, Doc<'users'>>()
    const cityById = await getCityByIdMap(ctx, cityIds)
    const cityUsers =
      cityIds.length > 0
        ? await Promise.all(
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
                .take(24),
            ),
          )
        : [
            await ctx.db
              .query('users')
              .withIndex('by_explore_rank', (query) =>
                query
                  .eq('appearInExplore', true)
                  .eq('deletedAt', null)
                  .eq('deactivatedAt', null),
              )
              .order('desc')
              .take(48),
          ]

    for (const usersInCity of cityUsers) {
      for (const user of usersInCity) {
        if (user._id === viewer._id) {
          continue
        }

        usersById.set(String(user._id), user)
      }
    }

    const rankedUsers = rankNearbyBuilders([...usersById.values()])
    const missingCityIds = [
      ...new Set(
        rankedUsers
          .map((user) => user.profile.cityId)
          .filter((cityId): cityId is Id<'cities'> => Boolean(cityId))
          .filter((cityId) => !cityById.has(String(cityId))),
      ),
    ]
    const missingCities = await getCityByIdMap(ctx, missingCityIds)
    for (const [cityId, city] of missingCities) {
      cityById.set(cityId, city)
    }

    return rankedUsers.map((user) => mapBuilderPreview(user, cityById))
  },
})

export const dismiss = mutation({
  args: {
    projectId: v.id('projects'),
  },
  returns: v.id('explore_history'),
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
