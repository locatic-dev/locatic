import { ConvexError, v } from 'convex/values'
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'

import { mutation, query, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { getViewerFromAuth, getViewerOrThrow } from './lib/auth'
import { mergeBuilderSearchCandidates } from './lib/discoverability'
import { buildProjectCardPreview } from './lib/project_previews'
import { getProjectTopics } from './lib/topics'
import {
  filterVisiblePosts,
  isPublicPostVisible,
  normalizePostSearchQuery,
} from './lib/posts'
import {
  collectVisibleExplorePage,
  isExplorePostInScope,
  isExploreProjectVisible,
  isNearbyBuilderVisible,
  rankExploreProjectsByStack,
  shouldReportPostSearchHasMore,
} from './lib/explore'
import {
  getViewerReactionTypesByTargetId,
  withViewerPostReactions,
} from './lib/reactions'

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
  reactionCounts: v.record(v.string(), v.number()),
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
    ownerLogin: v.string(),
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
  viewerHasLiked: v.boolean(),
  viewerReactionTypes: v.array(v.string()),
})

const postSearchPayloadValidator = v.object({
  posts: v.array(postSearchResultValidator),
  hasMore: v.boolean(),
})

const exploreScopeValidator = v.union(
  v.literal('default'),
  v.literal('global'),
  v.literal('custom'),
)

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

function getExploreScopedCityIds({
  selectedCityIds,
  scope,
  viewer,
}: {
  selectedCityIds?: Array<Id<'cities'>>
  scope?: 'default' | 'global' | 'custom'
  viewer: Doc<'users'>
}) {
  const resolvedScope = scope ?? 'default'
  const defaultCityIds =
    viewer.exploreConfig.cityIds.length > 0
      ? viewer.exploreConfig.cityIds
      : viewer.profile.cityId
        ? [viewer.profile.cityId]
        : []

  return {
    scope: resolvedScope,
    selectedCityIds:
      resolvedScope === 'global'
        ? []
        : resolvedScope === 'custom'
          ? Array.from(new Set(selectedCityIds ?? []))
          : defaultCityIds,
  }
}

function getExplorePostLimit(limit: number | undefined) {
  return Math.min(limit ?? 10, 50)
}

async function getDismissedExplorePostIds(
  ctx: QueryCtx,
  viewerId: Id<'users'>,
) {
  const dismissedPosts = await ctx.db
    .query('explore_post_history')
    .withIndex('by_user_dismissed', (query) =>
      query.eq('userId', viewerId).gt('dismissedAt', 0),
    )
    .collect()

  return new Set(dismissedPosts.map((item) => String(item.postId)))
}

function normalizeCityIds(ctx: QueryCtx, cityIds: Array<Id<'cities'>>) {
  return [...new Set(cityIds.map(String))].flatMap((cityId) => {
    const normalizedCityId = ctx.db.normalizeId('cities', cityId)
    return normalizedCityId ? [normalizedCityId] : []
  })
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: v.optional(exploreScopeValidator),
    selectedCityIds: v.optional(v.array(v.id('cities'))),
  },
  returns: paginationResultValidator(projectSearchResultValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)

    const { selectedCityIds } = getExploreScopedCityIds({
      scope: args.scope,
      selectedCityIds: args.selectedCityIds,
      viewer,
    })
    const cityIdSet = new Set(selectedCityIds.map(String))
    const stackPrefs = new Set(
      viewer.exploreConfig.stackPrefs.map((preference) =>
        preference.toLowerCase(),
      ),
    )

    const [ownedProjects, dismissedProjects] = await Promise.all([
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
    const ownedProjectIds = new Set(
      ownedProjects.map((project) => String(project._id)),
    )
    const dismissedProjectIds = new Set(
      dismissedProjects.map((item) => String(item.projectId)),
    )

    const visibleProjectsPage = await collectVisibleExplorePage<
      Doc<'projects'>
    >({
      cursor: args.paginationOpts.cursor,
      getVisibleItems: (projects) =>
        projects.filter((project) =>
          isExploreProjectVisible({
            dismissedProjectIds,
            ownedProjectIds,
            project,
            selectedCityCount: selectedCityIds.length,
            selectedCityIdSet: cityIdSet,
          }),
        ),
      loadBatch: (cursor) =>
        selectedCityIds.length === 1
          ? ctx.db
              .query('projects')
              .withIndex('by_explore_city_last_commit', (query) =>
                query
                  .eq('exploreOwner.cityId', selectedCityIds[0])
                  .eq('exploreOwner.isEligible', true),
              )
              .order('desc')
              .paginate({
                cursor,
                numItems: args.paginationOpts.numItems,
              })
          : ctx.db
              .query('projects')
              .withIndex('by_explore_eligible_last_commit', (query) =>
                query.eq('exploreOwner.isEligible', true),
              )
              .order('desc')
              .paginate({
                cursor,
                numItems: args.paginationOpts.numItems,
              }),
      numItems: args.paginationOpts.numItems,
    })
    const filtered = rankExploreProjectsByStack({
      getTopics: getProjectTopics,
      projects: visibleProjectsPage.page,
      stackPrefs,
    })

    const ownerById = new Map(
      (
        await Promise.all(
          [...new Set(filtered.map((project) => project.ownerId))].map(
            async (ownerId) =>
              [String(ownerId), await ctx.db.get(ownerId)] as const,
          ),
        )
      ).filter((entry): entry is readonly [string, Doc<'users'>] =>
        Boolean(entry[1]),
      ),
    )

    return {
      continueCursor: visibleProjectsPage.continueCursor,
      isDone: visibleProjectsPage.isDone,
      page: await Promise.all(
        filtered.map((project) =>
          buildProjectCardPreview(ctx.db, project, {
            audience: 'public',
            owner: ownerById.get(String(project.ownerId)),
          }),
        ),
      ),
    }
  },
})

export const listPosts = query({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: v.optional(exploreScopeValidator),
    selectedCityIds: v.optional(v.array(v.id('cities'))),
  },
  returns: paginationResultValidator(postSearchResultValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerFromAuth(ctx)
    if (!viewer) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
      }
    }

    const dismissedPostIds = await getDismissedExplorePostIds(ctx, viewer._id)
    const { selectedCityIds } = getExploreScopedCityIds({
      scope: args.scope,
      selectedCityIds: args.selectedCityIds,
      viewer,
    })
    const cityIdValues = normalizeCityIds(ctx, selectedCityIds)
    const cityIdSet = new Set(cityIdValues.map(String))

    const visiblePostsPage = await collectVisibleExplorePage<Doc<'posts'>>({
      cursor: args.paginationOpts.cursor,
      getVisibleItems: async (posts) =>
        await filterVisiblePosts(
          ctx,
          posts.filter((post) =>
            isExplorePostInScope({
              dismissedPostIds,
              post,
              selectedCityCount: cityIdValues.length,
              selectedCityIdSet: cityIdSet,
            }),
          ),
        ),
      loadBatch: (cursor) =>
        cityIdValues.length === 1
          ? ctx.db
              .query('posts')
              .withIndex('by_city_deleted_created', (query) =>
                query
                  .eq('projectCityId', cityIdValues[0])
                  .eq('deletedAt', null),
              )
              .order('desc')
              .paginate({
                cursor,
                numItems: args.paginationOpts.numItems,
              })
          : ctx.db
              .query('posts')
              .withIndex('by_deleted_created', (query) =>
                query.eq('deletedAt', null),
              )
              .order('desc')
              .paginate({
                cursor,
                numItems: args.paginationOpts.numItems,
              }),
      numItems: args.paginationOpts.numItems,
    })

    const viewerReactionTypesByTargetId =
      await getViewerReactionTypesByTargetId(ctx, viewer, {
        targetIds: visiblePostsPage.page.map((post) => String(post._id)),
        targetType: 'post',
      })

    return {
      continueCursor: visiblePostsPage.continueCursor,
      isDone: visiblePostsPage.isDone,
      page: withViewerPostReactions(
        visiblePostsPage.page,
        viewerReactionTypesByTargetId,
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

    const limit = Math.min(args.limit ?? 10, 50)
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
  returns: postSearchPayloadValidator,
  handler: async (ctx, args) => {
    const viewer = await getViewerFromAuth(ctx)
    if (!viewer) {
      return { hasMore: false, posts: [] }
    }

    const normalizedQ = args.q.trim().toLowerCase()
    if (!normalizedQ) {
      return { hasMore: false, posts: [] }
    }

    const limit = getExplorePostLimit(args.limit)
    const candidateTake = Math.min(Math.max((limit + 1) * 4, 40), 200)
    const dismissedPostIds = await getDismissedExplorePostIds(ctx, viewer._id)
    const cityIdValues = normalizeCityIds(ctx, args.cityIds ?? [])
    const perCityTake =
      cityIdValues.length > 0
        ? Math.ceil(candidateTake / cityIdValues.length)
        : candidateTake
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
                  .take(perCityTake),
              ),
            )
          ).flat()
        : await ctx.db
            .query('posts')
            .withSearchIndex('search_text', (query) =>
              query.search('searchText', normalizedQ).eq('deletedAt', null),
            )
            .take(candidateTake)

    const visiblePosts = (await filterVisiblePosts(ctx, posts))
      .filter((post) => !dismissedPostIds.has(String(post._id)))
      .slice(0, limit + 1)
    const resultPosts = visiblePosts.slice(0, limit)
    const viewerReactionTypesByTargetId =
      await getViewerReactionTypesByTargetId(ctx, viewer, {
        targetIds: resultPosts.map((post) => String(post._id)),
        targetType: 'post',
      })

    return {
      hasMore: shouldReportPostSearchHasMore({
        candidateCount: posts.length,
        candidateTake,
        limit,
        visibleCount: visiblePosts.length,
      }),
      posts: withViewerPostReactions(
        resultPosts,
        viewerReactionTypesByTargetId,
      ),
    }
  },
})

export const listNearbyBuilders = query({
  args: {
    cityIds: v.array(v.id('cities')),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(builderSearchResultValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const cityIds = Array.from(new Set(args.cityIds))
    const cityIdSet = new Set(cityIds.map(String))

    const paginated =
      cityIds.length === 1
        ? await ctx.db
            .query('users')
            .withIndex('by_city_explore_rank', (query) =>
              query
                .eq('profile.cityId', cityIds[0])
                .eq('appearInExplore', true)
                .eq('deletedAt', null)
                .eq('deactivatedAt', null),
            )
            .order('desc')
            .filter((q) => q.neq(q.field('_id'), viewer._id))
            .paginate(args.paginationOpts)
        : await collectVisibleExplorePage<Doc<'users'>>({
            cursor: args.paginationOpts.cursor,
            getVisibleItems: (users) =>
              users.filter((user) =>
                isNearbyBuilderVisible({
                  selectedCityCount: cityIds.length,
                  selectedCityIdSet: cityIdSet,
                  user,
                  viewerId: viewer._id,
                }),
              ),
            loadBatch: (cursor) =>
              ctx.db
                .query('users')
                .withIndex('by_explore_rank', (query) =>
                  query
                    .eq('appearInExplore', true)
                    .eq('deletedAt', null)
                    .eq('deactivatedAt', null),
                )
                .order('desc')
                .paginate({
                  cursor,
                  numItems: args.paginationOpts.numItems,
                }),
            numItems: args.paginationOpts.numItems,
          })

    const cityById = await getCityByIdMap(
      ctx,
      paginated.page
        .map((user) => user.profile.cityId)
        .filter((cityId): cityId is Id<'cities'> => Boolean(cityId)),
    )

    return {
      ...paginated,
      page: paginated.page.map((user) => mapBuilderPreview(user, cityById)),
    }
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

export const resetDismissedProjects = mutation({
  args: {},
  returns: v.object({
    resetCount: v.number(),
  }),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const dismissed = await ctx.db
      .query('explore_history')
      .withIndex('by_user_dismissed', (query) =>
        query.eq('userId', viewer._id).gt('dismissedAt', 0),
      )
      .collect()
    const now = Date.now()

    await Promise.all(
      dismissed.map((item) =>
        ctx.db.patch(item._id, {
          lastSeenAt: now,
          dismissedAt: null,
        }),
      ),
    )

    return {
      resetCount: dismissed.length,
    }
  },
})

export const dismissPost = mutation({
  args: {
    postId: v.id('posts'),
  },
  returns: v.id('explore_post_history'),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const post = await ctx.db.get(args.postId)
    if (
      !post ||
      post.deletedAt !== null ||
      !(await isPublicPostVisible(ctx, post))
    ) {
      throw new ConvexError('Post not found')
    }

    const existing = await ctx.db
      .query('explore_post_history')
      .withIndex('by_user_post', (query) =>
        query.eq('userId', viewer._id).eq('postId', args.postId),
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: Date.now(),
        dismissedAt: Date.now(),
      })
      return existing._id
    }

    return await ctx.db.insert('explore_post_history', {
      userId: viewer._id,
      postId: args.postId,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      dismissedAt: Date.now(),
    })
  },
})

export const resetDismissedPosts = mutation({
  args: {},
  returns: v.object({
    resetCount: v.number(),
  }),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const dismissed = await ctx.db
      .query('explore_post_history')
      .withIndex('by_user_dismissed', (query) =>
        query.eq('userId', viewer._id).gt('dismissedAt', 0),
      )
      .collect()
    const now = Date.now()

    await Promise.all(
      dismissed.map((item) =>
        ctx.db.patch(item._id, {
          lastSeenAt: now,
          dismissedAt: null,
        }),
      ),
    )

    return {
      resetCount: dismissed.length,
    }
  },
})
