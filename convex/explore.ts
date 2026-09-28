import { ConvexError, v } from 'convex/values'
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationOptions,
} from 'convex/server'

import { mutation, query, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { getViewerFromAuth, getViewerOrThrow } from './lib/auth'
import { mergeBuilderSearchCandidates } from './lib/discoverability'
import {
  buildProjectCardPreview,
  projectCardPreviewFields,
  projectCardPreviewValidator,
} from './lib/project_previews'
import { getProjectTopics } from './lib/topics'
import {
  filterDiscoverablePosts,
  isPublicPostVisible,
  normalizePostSearchQuery,
} from './lib/posts'
import { isOwnerDiscoverable } from './lib/snapshots'
import {
  clampExplorePaginationOpts,
  filterExplorePage,
  isExplorePostInScope,
  isExploreProjectVisible,
  isNearbyBuilderVisible,
  isNewBuilderAccount,
  isOpenToCollaboration,
  matchesExploreProjectFilters,
  normalizeExploreProjectFilters,
  rankExploreProjectsByStack,
  selectViewerCityProjects,
  shouldReportPostSearchHasMore,
  VIEWER_CITY_PROJECT_LIMIT,
  type ExploreProjectFilters,
} from './lib/explore'
import {
  getViewerReactionTypesByTargetId,
  withViewerPostReactions,
} from './lib/reactions'
import { publicIdentityFields } from './lib/validators'
import { isCityMember, toPublicIdentity } from './lib/visibility'

/**
 * Explore project rows are the reviewed public project card
 * (`projectCardPreviewValidator`, plan item C1): `buildProjectCardPreview`
 * with the public audience. Feed rows also carry the card signals (owner
 * location, build status, latest update, sync freshness); search rows do not.
 *
 * The signed-in project feed adds one viewer-relative field: `isViewerProject`
 * marks the viewer's own projects, which only appear after everyone else's
 * in an explicitly selected city (plan item C2).
 */
const viewerExploreProjectValidator = v.object({
  ...projectCardPreviewFields,
  isViewerProject: v.boolean(),
})

/** Reviewed public post fields (plan item C1); no search text, no viewer state. */
const publicPostFields = {
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
}

const publicExplorePostValidator = v.object(publicPostFields)

const postSearchResultValidator = v.object({
  ...publicPostFields,
  searchText: v.optional(v.string()),
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

type ExploreScope = 'default' | 'global' | 'custom'

/**
 * A builder row: public identity plus discovery counts and whether the
 * account is under 30 days old ("new builder", plan item D4).
 */
const builderSearchResultValidator = v.object({
  ...publicIdentityFields,
  projectsCount: v.number(),
  followersCount: v.number(),
  isNewBuilder: v.boolean(),
})

const exploreFeedArgs = {
  paginationOpts: paginationOptsValidator,
  scope: v.optional(exploreScopeValidator),
  selectedCityIds: v.optional(v.array(v.id('cities'))),
}

/**
 * Project feeds add the D2 filters: `language` (primary language) and
 * `topic` (canonical topic). Both optional, ANDed with scope and eligibility.
 */
const exploreProjectFeedArgs = {
  ...exploreFeedArgs,
  language: v.optional(v.string()),
  topic: v.optional(v.string()),
}

/** `openToCollab` keeps builders whose status invites someone in (D3). */
const nearbyBuildersArgs = {
  cityIds: v.array(v.id('cities')),
  paginationOpts: paginationOptsValidator,
  openToCollab: v.optional(v.boolean()),
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

async function getUsersById(ctx: QueryCtx, userIds: Array<Id<'users'>>) {
  const uniqueIds = [
    ...new Map(userIds.map((userId) => [String(userId), userId])).values(),
  ]
  const users = await Promise.all(uniqueIds.map((userId) => ctx.db.get(userId)))

  return new Map(
    users.flatMap((user) => (user ? [[String(user._id), user] as const] : [])),
  )
}

function mapBuilderPreview(
  user: Doc<'users'>,
  cityById: Map<string, Doc<'cities'>>,
  now: number,
) {
  return {
    ...toPublicIdentity(user, cityById),
    projectsCount: user.stats.projectsCount,
    followersCount: user.stats.followersCount,
    isNewBuilder: isNewBuilderAccount(user.createdAt, now),
  }
}

/** Region-only and hidden users never count for a city (D8). */
function isMemberOfAnyCity(
  user: Doc<'users'>,
  cityIds: ReadonlyArray<Id<'cities'> | string>,
) {
  return cityIds.some((cityId) => isCityMember(user, cityId))
}

/**
 * Resolves the cities a feed reads. `default` means the viewer's Explore
 * cities (else their profile city); a signed-out visitor has none, so
 * `default` reads everywhere.
 */
function getExploreScopedCityIds({
  selectedCityIds,
  scope,
  viewer,
}: {
  selectedCityIds?: Array<Id<'cities'>>
  scope?: ExploreScope
  viewer: Doc<'users'> | null
}) {
  const resolvedScope = scope ?? 'default'
  const defaultCityIds = !viewer
    ? []
    : viewer.exploreConfig.cityIds.length > 0
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

/**
 * One page of Explore projects for a set of cities (none means everywhere).
 * One `.paginate()` per execution (Convex limit, plan item A3): a single
 * city reads its own index range; several cities read the global eligible
 * index in the same order and keep rows whose owner city is in the selected
 * set, so one execution reads at most `numItems` projects. The viewer's own
 * and dismissed projects are dropped from the page; visitors pass
 * `viewerId: null` and no dismissals.
 *
 * The language and topic filters (plan item D2) are page filters too: a page
 * can come back empty with `isDone: false`, and the client's bounded
 * auto-fetch and "keep looking" action carry the continuation. See
 * docs/explore-home-logic.md for why neither is an index field.
 */
async function listExploreProjectPage(
  ctx: QueryCtx,
  {
    dismissedProjectIds,
    filters,
    paginationOpts,
    selectedCityIds,
    stackPrefs,
    viewerId,
  }: {
    dismissedProjectIds: Set<string>
    filters: ExploreProjectFilters
    paginationOpts: PaginationOptions
    selectedCityIds: Array<Id<'cities'>>
    stackPrefs: Set<string>
    viewerId: Id<'users'> | null
  },
) {
  const cityIdSet = new Set(selectedCityIds.map(String))
  const rawPage = await (
    selectedCityIds.length === 1
      ? ctx.db
          .query('projects')
          .withIndex('by_explore_city_last_commit', (query) =>
            query
              .eq('exploreOwner.cityId', selectedCityIds[0])
              .eq('exploreOwner.isEligible', true),
          )
      : ctx.db
          .query('projects')
          .withIndex('by_explore_eligible_last_commit', (query) =>
            query.eq('exploreOwner.isEligible', true),
          )
  )
    .order('desc')
    .paginate(clampExplorePaginationOpts(paginationOpts))

  return await filterExplorePage(rawPage, async (projects) => {
    const candidates = projects.filter(
      (project) =>
        isExploreProjectVisible({
          dismissedProjectIds,
          project,
          selectedCityCount: selectedCityIds.length,
          selectedCityIdSet: cityIdSet,
          viewerId: viewerId === null ? null : String(viewerId),
        }) && matchesExploreProjectFilters(project, filters, getProjectTopics),
    )
    const ownerById = await getUsersById(
      ctx,
      candidates.map((project) => project.ownerId),
    )
    // City-scoped feeds hold only projects of the cities' members. The
    // index already excludes non-members via `exploreOwner.cityId`;
    // checking the live owner also covers rows written before the owner's
    // latest privacy change was re-derived.
    const scopedProjects =
      selectedCityIds.length === 0
        ? candidates
        : candidates.filter((project) => {
            const owner = ownerById.get(String(project.ownerId))
            return owner ? isMemberOfAnyCity(owner, selectedCityIds) : false
          })

    return await Promise.all(
      rankExploreProjectsByStack({
        getTopics: getProjectTopics,
        projects: scopedProjects,
        stackPrefs,
      }).map((project) =>
        buildProjectCardPreview(ctx.db, project, {
          audience: 'public',
          owner: ownerById.get(String(project.ownerId)),
          signals: { viewerId },
        }),
      ),
    )
  })
}

/**
 * The viewer's own projects in an explicitly selected city, shown after the
 * city's other projects on the page that ends the feed (plan item C2). One
 * bounded read of the viewer's visible projects, and only when the page is
 * the last one, the scope is `custom` and the viewer is a member of a
 * selected city. The feed's language and topic filters apply to them too.
 */
async function listViewerCityProjects(
  ctx: QueryCtx,
  viewer: Doc<'users'>,
  {
    filters,
    isDone,
    scope,
    selectedCityIds,
  }: {
    filters: ExploreProjectFilters
    isDone: boolean
    scope: ExploreScope
    selectedCityIds: Array<Id<'cities'>>
  },
) {
  if (
    scope !== 'custom' ||
    !isDone ||
    !isMemberOfAnyCity(viewer, selectedCityIds)
  ) {
    return []
  }

  const ownProjects = await ctx.db
    .query('projects')
    .withIndex('by_owner_visible', (query) =>
      query.eq('ownerId', viewer._id).eq('locatic.isVisible', true),
    )
    // Newest projects first; the index is not ordered by commit time, so a
    // viewer with more visible projects than the limit sees their newest.
    .order('desc')
    .take(VIEWER_CITY_PROJECT_LIMIT)

  return await Promise.all(
    selectViewerCityProjects({
      isDone,
      projects: ownProjects.filter((project) =>
        matchesExploreProjectFilters(project, filters, getProjectTopics),
      ),
      scope,
      selectedCityIdSet: new Set(selectedCityIds.map(String)),
    }).map((project) =>
      buildProjectCardPreview(ctx.db, project, {
        audience: 'public',
        owner: viewer,
        signals: { viewerId: viewer._id },
      }),
    ),
  )
}

/**
 * One page of discoverable posts for a set of cities. One `.paginate()` per
 * execution (plan item A3); several cities read the global index and keep
 * posts whose project city is selected.
 */
async function listExplorePostPage(
  ctx: QueryCtx,
  {
    cityIds,
    dismissedPostIds,
    paginationOpts,
  }: {
    cityIds: Array<Id<'cities'>>
    dismissedPostIds: Set<string>
    paginationOpts: PaginationOptions
  },
) {
  const cityIdSet = new Set(cityIds.map(String))
  const rawPage = await (
    cityIds.length === 1
      ? ctx.db
          .query('posts')
          .withIndex('by_city_deleted_created', (query) =>
            query.eq('projectCityId', cityIds[0]).eq('deletedAt', null),
          )
      : ctx.db
          .query('posts')
          .withIndex('by_deleted_created', (query) =>
            query.eq('deletedAt', null),
          )
  )
    .order('desc')
    .paginate(clampExplorePaginationOpts(paginationOpts))

  return await filterExplorePage(rawPage, async (posts) =>
    (
      await filterDiscoverablePosts(
        ctx,
        posts.filter((post) =>
          isExplorePostInScope({
            dismissedPostIds,
            post,
            selectedCityCount: cityIds.length,
            selectedCityIdSet: cityIdSet,
          }),
        ),
      )
    ).filter(
      // `filterDiscoverablePosts` keeps posts of discoverable owners only and
      // sets `projectCityId` from the live owner, so a post whose owner left
      // discovery or stopped being a city member leaves every feed even if
      // its stored index field has not been re-derived yet.
      (post) =>
        cityIds.length === 0 ||
        (post.projectCityId !== null &&
          cityIdSet.has(String(post.projectCityId))),
    ),
  )
}

type VisibleExplorePost = Awaited<
  ReturnType<typeof listExplorePostPage>
>['page'][number]

/**
 * Public projection of a post (plan item C1). The actor's location already
 * comes from the live user under the visibility policy
 * (`filterDiscoverablePosts`), so a later privacy change applies at once.
 */
function toPublicExplorePosts(posts: VisibleExplorePost[]) {
  return posts.map((post) => ({
    _id: post._id,
    _creationTime: post._creationTime,
    projectId: post.projectId,
    ownerId: post.ownerId,
    actorId: post.actorId,
    authorRole: post.authorRole,
    body: post.body,
    reactionCounts: post.reactionCounts,
    commentsCount: post.commentsCount,
    projectCityId: post.projectCityId,
    projectTopics: post.projectTopics,
    actorSnapshot: {
      displayName: post.actorSnapshot.displayName,
      avatarUrl: post.actorSnapshot.avatarUrl,
      cityId: post.actorSnapshot.cityId,
      cityName: post.actorSnapshot.cityName,
    },
    projectSnapshot: post.projectSnapshot,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }))
}

/**
 * One page of builders for a set of cities (none means everywhere). One
 * `.paginate()` per execution (plan item A3); the filters run on the returned
 * page so one execution reads at most `numItems` users. Visitors see only
 * builders whose profile is public (`profileVisibility: 'public'`), since a
 * `locatic_only` profile is for signed-in members.
 *
 * Order (plan item D4): most recent public work first, from
 * `users.by_city_public_activity` (one city) or `users.by_public_activity`
 * (several cities or everywhere), read descending. Convex sorts a missing
 * field before every number, so in descending order builders without
 * `stats.lastPublicActivityAt` come after every active builder, newest
 * account first (index ties fall back to insertion order, and users are
 * inserted with `createdAt` set to the insertion time). One index read per
 * page covers both groups. Neither index holds `deletedAt` or
 * `deactivatedAt`, so those are page filters, as is `openToCollab` (D3).
 */
async function listNearbyBuilderPage(
  ctx: QueryCtx,
  {
    cityIds: requestedCityIds,
    openToCollab,
    paginationOpts,
    viewerId,
  }: {
    cityIds: Array<Id<'cities'>>
    openToCollab: boolean
    paginationOpts: PaginationOptions
    viewerId: Id<'users'> | null
  },
) {
  const cityIds = Array.from(new Set(requestedCityIds))
  const cityIdSet = new Set(cityIds.map(String))

  const rawPage = await (
    cityIds.length === 1
      ? ctx.db
          .query('users')
          .withIndex('by_city_public_activity', (query) =>
            query.eq('appearInExplore', true).eq('profile.cityId', cityIds[0]),
          )
      : ctx.db
          .query('users')
          .withIndex('by_public_activity', (query) =>
            query.eq('appearInExplore', true),
          )
  )
    .order('desc')
    .paginate(clampExplorePaginationOpts(paginationOpts))

  const paginated = await filterExplorePage(rawPage, (users) =>
    users.filter(
      (user) =>
        user.deletedAt === null &&
        user.deactivatedAt === null &&
        (!openToCollab || isOpenToCollaboration(user.profile.buildStatus)) &&
        isNearbyBuilderVisible({
          selectedCityCount: cityIds.length,
          selectedCityIdSet: cityIdSet,
          user,
          viewerId,
        }) &&
        (viewerId !== null || user.privacy.profileVisibility === 'public') &&
        // City-scoped lists hold exact-city members only (D8); the global
        // list (no cities) depends on discovery participation alone.
        (cityIds.length === 0 || isMemberOfAnyCity(user, cityIds)),
    ),
  )

  const cityById = await getCityByIdMap(
    ctx,
    paginated.page
      .map((user) => user.profile.cityId)
      .filter((cityId): cityId is Id<'cities'> => Boolean(cityId)),
  )

  const now = Date.now()
  return {
    ...paginated,
    page: paginated.page.map((user) => mapBuilderPreview(user, cityById, now)),
  }
}

export const list = query({
  args: exploreProjectFeedArgs,
  returns: paginationResultValidator(viewerExploreProjectValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)

    const { scope, selectedCityIds } = getExploreScopedCityIds({
      scope: args.scope,
      selectedCityIds: args.selectedCityIds,
      viewer,
    })
    const dismissedProjects = await ctx.db
      .query('explore_history')
      .withIndex('by_user_dismissed', (query) =>
        query.eq('userId', viewer._id).gt('dismissedAt', 0),
      )
      .collect()

    const filters = normalizeExploreProjectFilters(args)
    const projectPage = await listExploreProjectPage(ctx, {
      dismissedProjectIds: new Set(
        dismissedProjects.map((item) => String(item.projectId)),
      ),
      filters,
      paginationOpts: args.paginationOpts,
      selectedCityIds,
      stackPrefs: new Set(
        viewer.exploreConfig.stackPrefs.map((preference) =>
          preference.toLowerCase(),
        ),
      ),
      viewerId: viewer._id,
    })
    const viewerProjects = await listViewerCityProjects(ctx, viewer, {
      filters,
      isDone: projectPage.isDone,
      scope,
      selectedCityIds,
    })

    return {
      ...projectPage,
      page: [
        ...projectPage.page.map((project) => ({
          ...project,
          isViewerProject: false,
        })),
        ...viewerProjects.map((project) => ({
          ...project,
          isViewerProject: true,
        })),
      ],
    }
  },
})

/**
 * Signed-out Explore projects (plan item C1): the same arguments, index
 * reads and pagination as `list`, without viewer state. `default` scope
 * reads everywhere because a visitor has no Explore cities.
 */
export const listPublic = query({
  args: exploreProjectFeedArgs,
  returns: paginationResultValidator(projectCardPreviewValidator),
  handler: async (ctx, args) => {
    const { selectedCityIds } = getExploreScopedCityIds({
      scope: args.scope,
      selectedCityIds: args.selectedCityIds,
      viewer: null,
    })

    return await listExploreProjectPage(ctx, {
      dismissedProjectIds: new Set(),
      filters: normalizeExploreProjectFilters(args),
      paginationOpts: args.paginationOpts,
      selectedCityIds,
      stackPrefs: new Set(),
      viewerId: null,
    })
  },
})

export const listPosts = query({
  args: exploreFeedArgs,
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

    const { selectedCityIds } = getExploreScopedCityIds({
      scope: args.scope,
      selectedCityIds: args.selectedCityIds,
      viewer,
    })
    const visiblePostsPage = await listExplorePostPage(ctx, {
      cityIds: normalizeCityIds(ctx, selectedCityIds),
      dismissedPostIds: await getDismissedExplorePostIds(ctx, viewer._id),
      paginationOpts: args.paginationOpts,
    })

    const viewerReactionTypesByTargetId =
      await getViewerReactionTypesByTargetId(ctx, viewer, {
        targetIds: visiblePostsPage.page.map((post) => String(post._id)),
        targetType: 'post',
      })

    return {
      ...visiblePostsPage,
      page: withViewerPostReactions(
        visiblePostsPage.page,
        viewerReactionTypesByTargetId,
      ),
    }
  },
})

/** Signed-out Explore posts (plan item C1): reviewed public post fields. */
export const listPostsPublic = query({
  args: exploreFeedArgs,
  returns: paginationResultValidator(publicExplorePostValidator),
  handler: async (ctx, args) => {
    const { selectedCityIds } = getExploreScopedCityIds({
      scope: args.scope,
      selectedCityIds: args.selectedCityIds,
      viewer: null,
    })
    const visiblePostsPage = await listExplorePostPage(ctx, {
      cityIds: normalizeCityIds(ctx, selectedCityIds),
      dismissedPostIds: new Set(),
      paginationOpts: args.paginationOpts,
    })

    return {
      ...visiblePostsPage,
      page: toPublicExplorePosts(visiblePostsPage.page),
    }
  },
})

export const searchBuilders = query({
  args: {
    q: v.string(),
    cityIds: v.optional(v.array(v.id('cities'))),
    limit: v.optional(v.number()),
    openToCollab: v.optional(v.boolean()),
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

    // A city filter only matches that city's members (D8).
    const isInCityScope = (user: Doc<'users'>) =>
      cityIds.length === 0 || isMemberOfAnyCity(user, cityIds)
    const matchesFilters = (user: Doc<'users'>) =>
      isInCityScope(user) &&
      (!args.openToCollab || isOpenToCollaboration(user.profile.buildStatus))
    const builders = mergeBuilderSearchCandidates({
      exactMatch: exactMatch && matchesFilters(exactMatch) ? exactMatch : null,
      // Apply filters to the bounded search window before taking the result
      // limit. Otherwise a page of solo builders can hide a collaboration
      // match that is already present later in the same window.
      searchResults: searchResults.filter(matchesFilters),
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

    const now = Date.now()
    return builders.map((builder) => mapBuilderPreview(builder, cityById, now))
  },
})

export const searchProjects = query({
  args: {
    q: v.string(),
    cityIds: v.optional(v.array(v.id('cities'))),
    limit: v.optional(v.number()),
    language: v.optional(v.string()),
    topic: v.optional(v.string()),
  },
  returns: v.object({
    projectResultScope: v.literal('recent'),
    projects: v.array(projectCardPreviewValidator),
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
    const filters = normalizeExploreProjectFilters(args)
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_explore_eligible_added', (query) =>
        query.eq('exploreOwner.isEligible', true),
      )
      .order('desc')
      .take(cityIds.size > 0 ? limit * 8 : limit * 5)
    const matchingProjects = projects.filter((project) => {
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

      return (
        searchText.includes(normalizedQ) &&
        matchesExploreProjectFilters(project, filters, getProjectTopics)
      )
    })
    const ownerById = await getUsersById(
      ctx,
      matchingProjects.map((project) => project.ownerId),
    )
    // `exploreOwner` can predate the owner's latest change (rows written
    // before the owner-state backfill), so the live owner decides: still
    // discoverable and, for a city filter, still a member of a selected city.
    const selectedCityIds = [...cityIds]
    const resultProjects = matchingProjects
      .filter((project) => {
        const owner = ownerById.get(String(project.ownerId))
        return (
          owner !== undefined &&
          isOwnerDiscoverable(owner) &&
          (selectedCityIds.length === 0 ||
            isMemberOfAnyCity(owner, selectedCityIds))
        )
      })
      .slice(0, limit)

    return {
      projectResultScope: 'recent' as const,
      projects: await Promise.all(
        resultProjects.map((project) =>
          buildProjectCardPreview(ctx.db, project, {
            audience: 'public',
            owner: ownerById.get(String(project.ownerId)),
            signals: { viewerId: viewer._id },
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

    const cityIdSet = new Set(cityIdValues.map(String))
    const visiblePosts = (await filterDiscoverablePosts(ctx, posts))
      .filter(
        (post) =>
          !dismissedPostIds.has(String(post._id)) &&
          // A city filter matches the owner's current member city (D8).
          (cityIdSet.size === 0 ||
            (post.projectCityId !== null &&
              cityIdSet.has(String(post.projectCityId)))),
      )
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
  args: nearbyBuildersArgs,
  returns: paginationResultValidator(builderSearchResultValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    return await listNearbyBuilderPage(ctx, {
      cityIds: args.cityIds,
      openToCollab: args.openToCollab ?? false,
      paginationOpts: args.paginationOpts,
      viewerId: viewer._id,
    })
  },
})

/**
 * Signed-out Explore builders (plan item C1): public identity (location per
 * the visibility policy) and discovery counts, public profiles only.
 */
export const listNearbyBuildersPublic = query({
  args: nearbyBuildersArgs,
  returns: paginationResultValidator(builderSearchResultValidator),
  handler: async (ctx, args) =>
    await listNearbyBuilderPage(ctx, {
      cityIds: args.cityIds,
      openToCollab: args.openToCollab ?? false,
      paginationOpts: args.paginationOpts,
      viewerId: null,
    }),
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
