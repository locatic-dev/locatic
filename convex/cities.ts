import {
  internalMutation,
  query,
  type DatabaseReader,
} from './_generated/server'
import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { DEFAULT_CITIES } from './citiesSeed'
import { clampCitySearchLimit, searchCities } from './lib/citySearch'
import {
  getCityStats,
  readCityStats,
  readNearbyActiveCities,
  recountCityStats,
  type NearbyActiveCity,
} from './lib/cityStats'
import { isNewBuilderAccount } from './lib/explore'
import { filterDiscoverablePosts } from './lib/posts'
import {
  buildProjectCardPreview,
  projectCardPreviewValidator,
} from './lib/project_previews'
import { publicIdentityFields } from './lib/validators'
import {
  getRegionLabel,
  isCityMember,
  toPublicIdentity,
} from './lib/visibility'

/**
 * City search (plan item B10): exact name or alias matches, then name and
 * alias prefixes, then other full-text hits; ranking rules live in
 * `convex/lib/citySearch.ts`. An empty query returns the first active cities
 * by name. Returns full city documents.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = clampCitySearchLimit(args.limit)
    if (!args.query.trim()) {
      return (await ctx.db.query('cities').withIndex('by_name').take(40))
        .filter((city) => city.isActive)
        .slice(0, limit)
    }

    return await searchCities(ctx.db, args.query, limit)
  },
})

export const listPopular = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query('cities').withIndex('by_name').take(40))
      .filter((city) => city.isActive)
      .slice(0, 20)
  },
})

export const listByIds = query({
  args: {
    cityIds: v.array(v.id('cities')),
  },
  handler: async (ctx, args) => {
    const cities = await Promise.all(
      args.cityIds.map((cityId) => ctx.db.get(cityId)),
    )
    return cities.filter((city): city is NonNullable<typeof city> =>
      Boolean(city),
    )
  },
})

const cityStatsValidator = v.object({
  builderCount: v.number(),
  projectCount: v.number(),
  lastActivityAt: v.union(v.number(), v.null()),
})

/**
 * Maintained counters for one city (plan item A4): exact-city, discoverable
 * builders; their eligible projects; latest activity on those projects.
 * Null for an unknown city id. A single document read.
 */
export const getStats = query({
  args: {
    cityId: v.id('cities'),
  },
  returns: v.union(v.null(), cityStatsValidator),
  handler: async (ctx, args) => await getCityStats(ctx.db, args.cityId),
})

// City page bounds (plan item D5, documented in docs/explore-home-logic.md).
// Recent work is one page of the city's projects. Builders and posts read a
// few more rows than they show, because region-only, hidden and removed
// accounts, and posts that fail the visibility checks, share the index range.
const CITY_PAGE_PROJECT_LIMIT = 12
const CITY_PAGE_BUILDER_LIMIT = 12
const CITY_PAGE_BUILDER_READ_LIMIT = 36
const CITY_PAGE_POST_LIMIT = 6
const CITY_PAGE_POST_READ_LIMIT = 18

const cityPageCityValidator = v.object({
  cityId: v.id('cities'),
  slug: v.string(),
  name: v.string(),
  displayName: v.string(),
  regionLabel: v.union(v.string(), v.null()),
  location: v.object({ lat: v.number(), lng: v.number() }),
})

const cityPageBuilderValidator = v.object({
  ...publicIdentityFields,
  projectsCount: v.number(),
  isNewBuilder: v.boolean(),
})

const cityPagePostValidator = v.object({
  postId: v.id('posts'),
  body: v.string(),
  createdAt: v.number(),
  commentsCount: v.number(),
  project: v.object({
    name: v.string(),
    fullName: v.string(),
    ownerLogin: v.string(),
  }),
  author: v.object(publicIdentityFields),
})

const nearbyCityValidator = v.object({
  cityId: v.id('cities'),
  slug: v.string(),
  name: v.string(),
  regionLabel: v.union(v.string(), v.null()),
  location: v.object({ lat: v.number(), lng: v.number() }),
  builderCount: v.number(),
  projectCount: v.number(),
  distanceKm: v.number(),
})

const cityPageValidator = v.object({
  city: cityPageCityValidator,
  stats: cityStatsValidator,
  recentWork: v.object({
    projects: v.array(projectCardPreviewValidator),
    hasMore: v.boolean(),
  }),
  builders: v.array(cityPageBuilderValidator),
  posts: v.array(cityPagePostValidator),
  nearby: v.array(nearbyCityValidator),
})

/**
 * The city a page address names: its slug, or its id (city pills link by id
 * until location payloads carry the slug; the route then redirects to the
 * slug). Unknown and inactive cities resolve to null.
 */
async function resolveCityPageCity(
  db: DatabaseReader,
  slugOrId: string,
): Promise<Doc<'cities'> | null> {
  const bySlug = await db
    .query('cities')
    .withIndex('by_slug', (query) => query.eq('slug', slugOrId))
    .first()
  const cityId = bySlug ? null : db.normalizeId('cities', slugOrId)
  const city = bySlug ?? (cityId ? await db.get(cityId) : null)
  return city?.isActive ? city : null
}

function isLiveCityMember(user: Doc<'users'>, cityId: Id<'cities'>) {
  return (
    user.deletedAt === null &&
    user.deactivatedAt === null &&
    isCityMember(user, cityId)
  )
}

async function readUsersById(db: DatabaseReader, userIds: Array<Id<'users'>>) {
  const unique = [...new Set(userIds.map(String))] as Array<Id<'users'>>
  const users = await Promise.all(unique.map((userId) => db.get(userId)))
  return new Map(
    users.flatMap((user) => (user ? [[String(user._id), user] as const] : [])),
  )
}

/**
 * Recent work: one page of the city's eligible projects, newest commit
 * first, on `by_explore_city_last_commit` (the one `.paginate()` of the
 * page). The live owner must still be a member of the city, as in Explore.
 */
async function readCityRecentWork(db: DatabaseReader, city: Doc<'cities'>) {
  const page = await db
    .query('projects')
    .withIndex('by_explore_city_last_commit', (query) =>
      query
        .eq('exploreOwner.cityId', city._id)
        .eq('exploreOwner.isEligible', true),
    )
    .order('desc')
    .paginate({ cursor: null, numItems: CITY_PAGE_PROJECT_LIMIT })
  const ownerById = await readUsersById(
    db,
    page.page.map((project) => project.ownerId),
  )
  const projects = page.page.filter((project) => {
    const owner = ownerById.get(String(project.ownerId))
    return (
      project.locatic.isVisible &&
      owner !== undefined &&
      owner.appearInExplore &&
      isLiveCityMember(owner, city._id)
    )
  })

  return {
    projects: await Promise.all(
      projects.map((project) =>
        buildProjectCardPreview(db, project, {
          audience: 'public',
          owner: ownerById.get(String(project.ownerId)),
          signals: { viewerId: null },
        }),
      ),
    ),
    hasMore: !page.isDone,
  }
}

/**
 * Builders: exact-city members with public profiles, most recent public work
 * first (plan item D4) from one bounded read of `by_city_public_activity`,
 * descending, so builders without the signal follow, newest account first.
 */
async function readCityBuilders(
  db: DatabaseReader,
  city: Doc<'cities'>,
  now: number,
) {
  const candidates = await db
    .query('users')
    .withIndex('by_city_public_activity', (query) =>
      query.eq('appearInExplore', true).eq('profile.cityId', city._id),
    )
    .order('desc')
    .take(CITY_PAGE_BUILDER_READ_LIMIT)
  const cityById = new Map([[String(city._id), city]])

  return candidates
    .filter(
      (user) =>
        isLiveCityMember(user, city._id) &&
        user.privacy.profileVisibility === 'public',
    )
    .slice(0, CITY_PAGE_BUILDER_LIMIT)
    .map((user) => ({
      ...toPublicIdentity(user, cityById),
      projectsCount: user.stats.projectsCount,
      isNewBuilder: isNewBuilderAccount(user.createdAt, now),
    }))
}

/**
 * Recent posts on the city's projects: one bounded read of
 * `by_city_deleted_created`, then the discovery checks Explore applies
 * (`filterDiscoverablePosts`: visible project, owner active and in
 * discovery) and the project's current city from the live owner.
 */
async function readCityPosts(db: DatabaseReader, city: Doc<'cities'>) {
  const rows = await db
    .query('posts')
    .withIndex('by_city_deleted_created', (query) =>
      query.eq('projectCityId', city._id).eq('deletedAt', null),
    )
    .order('desc')
    .take(CITY_PAGE_POST_READ_LIMIT)
  const posts = (await filterDiscoverablePosts({ db }, rows))
    .filter((post) => String(post.projectCityId) === String(city._id))
    .slice(0, CITY_PAGE_POST_LIMIT)
  const actorById = await readUsersById(
    db,
    posts.map((post) => post.actorId),
  )
  const cityIds = [
    ...new Set(
      [...actorById.values()].flatMap((actor) =>
        actor.profile.cityId ? [String(actor.profile.cityId)] : [],
      ),
    ),
  ] as Array<Id<'cities'>>
  const cities = await Promise.all(
    cityIds.map(async (cityId) =>
      String(cityId) === String(city._id) ? city : await db.get(cityId),
    ),
  )
  const cityById = new Map(
    cities.flatMap((row) => (row ? [[String(row._id), row] as const] : [])),
  )

  return posts.flatMap((post) => {
    const actor = actorById.get(String(post.actorId))
    return actor
      ? [
          {
            postId: post._id,
            body: post.body,
            createdAt: post.createdAt,
            commentsCount: post.commentsCount,
            project: {
              name: post.projectSnapshot.name,
              fullName: post.projectSnapshot.fullName,
              ownerLogin: post.projectSnapshot.ownerLogin,
            },
            author: toPublicIdentity(actor, cityById),
          },
        ]
      : []
  })
}

/**
 * Everything a public city page shows (plan item D5), or null for an unknown
 * or inactive city. Every read is indexed and bounded: the city by slug (or
 * id), one page of projects, one `take` of builders, one `take` of posts
 * plus their visibility reads, and the nearby lookup's nine cell reads.
 * Counts are the maintained A4 counters, never aggregated here. Exported for
 * the read-shape test.
 */
export async function readCityPage(db: DatabaseReader, slugOrId: string) {
  const city = await resolveCityPageCity(db, slugOrId)
  if (!city) {
    return null
  }

  const now = Date.now()
  const [recentWork, builders, posts, nearby] = await Promise.all([
    readCityRecentWork(db, city),
    readCityBuilders(db, city, now),
    readCityPosts(db, city),
    readNearbyActiveCities(db, city),
  ])

  return {
    city: {
      cityId: city._id,
      slug: city.slug,
      name: city.name,
      displayName: city.displayName,
      regionLabel: getRegionLabel(city),
      location: city.location,
    },
    stats: readCityStats(city),
    recentWork,
    builders,
    posts,
    nearby: nearby.map(toNearbyCityRow),
  }
}

/** The public row for one nearby active city: city-level fields only. */
function toNearbyCityRow({
  city,
  stats,
  distanceKm,
}: NearbyActiveCity): Infer<typeof nearbyCityValidator> {
  return {
    cityId: city._id,
    slug: city.slug,
    name: city.name,
    regionLabel: getRegionLabel(city),
    location: city.location,
    builderCount: stats.builderCount,
    projectCount: stats.projectCount,
    distanceKm: Math.round(distanceKm),
  }
}

/**
 * Public city page (plan item D5), the SSR loader's one query for
 * `/c/$slug`. Public: the same reviewed payload for visitors and members
 * (public identities through the visibility policy, public project cards,
 * builders with public profiles only). Null for an unknown or inactive city.
 */
export const getPage = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), cityPageValidator),
  handler: async (ctx, args) => await readCityPage(ctx.db, args.slug),
})

/**
 * Nearby active cities for the Explore rail: one city read plus the nine
 * `by_activity_cell` reads of `readNearbyActiveCities`. City-level fields
 * only, the same rows as `getPage(...).nearby`. Empty for an unknown or
 * inactive city.
 */
export const listNearby = query({
  args: { cityId: v.id('cities') },
  returns: v.array(nearbyCityValidator),
  handler: async (ctx, args) => {
    const city = await ctx.db.get(args.cityId)
    if (!city || !city.isActive) return []
    return (await readNearbyActiveCities(ctx.db, city)).map(toNearbyCityRow)
  },
})

const recountPhaseValidator = v.union(
  v.literal('users'),
  v.literal('projects'),
  v.literal('cities'),
)

const RECOUNT_PHASES = ['users', 'projects', 'cities'] as const

/**
 * Source rows per recount run. Each distinct city on a page costs a full
 * recount of that city (`computeCityStats` reads all of its members and
 * eligible projects), so a page names at most this many cities and one run
 * stays inside Convex's per-mutation read limits even when every row names a
 * different large city.
 */
const RECOUNT_DEFAULT_BATCH = 25
const RECOUNT_MAX_BATCH = 50
type RecountPhase = (typeof RECOUNT_PHASES)[number]

/** One page of the recount's source table, reduced to the city ids it names. */
async function readRecountPage(
  db: DatabaseReader,
  phase: RecountPhase,
  paginationOpts: { cursor: string | null; numItems: number },
): Promise<{
  cityIds: Array<Id<'cities'> | null>
  isDone: boolean
  continueCursor: string
}> {
  switch (phase) {
    case 'users': {
      const page = await db.query('users').paginate(paginationOpts)
      return {
        ...page,
        cityIds: page.page.map((user) => user.profile.cityId),
      }
    }
    case 'projects': {
      const page = await db.query('projects').paginate(paginationOpts)
      return {
        ...page,
        cityIds: page.page.map((project) => project.exploreOwner.cityId),
      }
    }
    case 'cities': {
      const page = await db.query('cities').paginate(paginationOpts)
      return {
        ...page,
        cityIds: page.page
          .filter((city) => city.stats !== undefined)
          .map((city) => city._id),
      }
    }
  }
}

/**
 * One-off recount of `cities.stats` (plan item A4). Not run on deploy or by a
 * cron; a person runs it once after A4 ships (after
 * `internal.users.backfillOwnerState`), and again whenever the counters are
 * suspected to have drifted:
 *
 *   npx convex run cities:recountStats '{}'            # dev deployment
 *   npx convex run --prod cities:recountStats '{}'     # production
 *
 * It schedules itself page by page through three phases: every city named by
 * a user's `profile.cityId`, then by a project's `exploreOwner.cityId`, then
 * any other city that still holds stats (to clear drift). A page holds
 * `RECOUNT_DEFAULT_BATCH` (25) rows by default and at most
 * `RECOUNT_MAX_BATCH` (50); its distinct cities are recounted in that run.
 * Each touched city is set to exact values from its own index ranges and
 * stamped with the run's start time, so a city is recounted once per run and
 * re-running is safe.
 * Concurrent writes stay correct: a recount sets absolute values and later
 * deltas apply on top of them.
 */
export const recountStats = internalMutation({
  args: {
    phase: v.optional(recountPhaseValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
    runStartedAt: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    phase: recountPhaseValidator,
    recountedCities: v.number(),
    scheduledContinuation: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const phase = args.phase ?? 'users'
    const runStartedAt = args.runStartedAt ?? Date.now()
    const batchSize = Math.min(
      Math.max(args.batchSize ?? RECOUNT_DEFAULT_BATCH, 1),
      RECOUNT_MAX_BATCH,
    )

    const { cityIds, isDone, continueCursor } = await readRecountPage(
      ctx.db,
      phase,
      { cursor: args.cursor ?? null, numItems: batchSize },
    )

    let recountedCities = 0
    const distinctCityIds = new Set(
      cityIds.filter((cityId): cityId is Id<'cities'> => cityId !== null),
    )
    for (const cityId of distinctCityIds) {
      if (await recountCityStats(ctx.db, cityId, runStartedAt)) {
        recountedCities += 1
      }
    }

    const nextPhase = isDone
      ? RECOUNT_PHASES[RECOUNT_PHASES.indexOf(phase) + 1]
      : phase
    if (nextPhase) {
      await ctx.scheduler.runAfter(0, internal.cities.recountStats, {
        phase: nextPhase,
        cursor: isDone ? null : continueCursor,
        runStartedAt,
        batchSize,
      })
    }

    return {
      phase,
      recountedCities,
      scheduledContinuation: nextPhase !== undefined,
    }
  },
})

export const seedDefaultCities = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0
    const now = Date.now()

    for (const city of DEFAULT_CITIES) {
      const existing = await ctx.db
        .query('cities')
        .withIndex('by_slug', (query) => query.eq('slug', city.slug))
        .unique()

      if (existing) {
        continue
      }

      await ctx.db.insert('cities', {
        slug: city.slug,
        name: city.name,
        displayName: city.displayName,
        normalizedName: city.displayName.toLowerCase(),
        region: city.region,
        country: city.country,
        countryCode: city.countryCode,
        location: {
          lat: city.lat,
          lng: city.lng,
        },
        address: city.address,
        aliases: city.aliases,
        timezone: city.timezone,
        searchText: [city.displayName, city.name, ...city.aliases].join(' '),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })

      created += 1
    }

    return { created }
  },
})

/**
 * Rows the landing map reads (plan item D7). The map has a few hundred land
 * dots, so more cities than this would only stack on the same dots; past
 * the limit the map shows an arbitrary subset of active cities.
 */
const ACTIVE_MAP_CITY_READ_LIMIT = 200

const activeMapCityValidator = v.object({
  slug: v.string(),
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  builderCount: v.number(),
})

/**
 * Active catalogue cities with at least one counted builder (A4
 * `builderCount`, which already leaves out hidden and region-only users),
 * most builders first. One bounded read of `by_activity_cell`, which holds
 * only cities with A4 activity (D5), so the read never scans the catalogue.
 * Exported for the read-shape test.
 */
export async function readActiveMapCities(db: DatabaseReader) {
  // Cities without activity have no `activityCell`; missing values sort
  // before every string, so this range holds active cities only.
  const cities = await db
    .query('cities')
    .withIndex('by_activity_cell', (query) => query.gt('activityCell', ''))
    .take(ACTIVE_MAP_CITY_READ_LIMIT)

  return cities
    .flatMap((city) => {
      const { builderCount, lastActivityAt } = readCityStats(city)
      return city.isActive && builderCount > 0
        ? [
            {
              slug: city.slug,
              name: city.name,
              lat: city.location.lat,
              lng: city.location.lng,
              builderCount,
              lastActivityAt,
            },
          ]
        : []
    })
    .sort(
      (left, right) =>
        right.builderCount - left.builderCount ||
        left.name.localeCompare(right.name),
    )
}

/**
 * Public aggregate for the landing map (plan item D7): the cities from
 * `readActiveMapCities`. City-level fields only: no user appears in the
 * payload.
 */
export const listActiveForMap = query({
  args: {},
  returns: v.array(activeMapCityValidator),
  handler: async (ctx) =>
    // `lastActivityAt` is for the sitemap; the map payload stays as it was.
    (await readActiveMapCities(ctx.db)).map(
      ({ lastActivityAt: _lastActivityAt, ...city }) => city,
    ),
})
