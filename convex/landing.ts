import { v } from 'convex/values'

import { query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { resolveProjectOwnerLogin } from './lib/project_route'
import { isOwnerDiscoverable } from './lib/snapshots'
import { optionalStringValidator } from './lib/validators'
import { resolveLocationDisclosure } from './lib/visibility'

/** Items the landing globe cycles through (plan item D7). */
const LANDING_ACTIVITY_LIMIT = 12
/** Most items one builder contributes, so a busy builder cannot fill the globe. */
const LANDING_ACTIVITY_PER_ACTOR = 2
/**
 * Rows read per source. More than the globe shows, since rows of hidden
 * projects, owners who left discovery or region-only owners drop out.
 */
const POST_READ_LIMIT = 24
const RELEASE_READ_LIMIT = 24
const PROJECT_READ_LIMIT = 12
const PUSH_READ_LIMIT = 12
/** Longest post excerpt, in characters, before the ellipsis. */
const POST_EXCERPT_LENGTH = 90

const activityBaseFields = {
  key: v.string(),
  at: v.number(),
  actor: v.object({
    name: v.string(),
    handle: v.string(),
    avatarUrl: optionalStringValidator,
  }),
  project: v.object({
    owner: v.string(),
    repo: v.string(),
    description: optionalStringValidator,
  }),
  city: v.object({
    name: v.string(),
    slug: v.string(),
    lat: v.number(),
    lng: v.number(),
  }),
}

export const landingActivityValidator = v.union(
  v.object({ ...activityBaseFields, kind: v.literal('project') }),
  v.object({ ...activityBaseFields, kind: v.literal('push') }),
  v.object({
    ...activityBaseFields,
    kind: v.literal('post'),
    postId: v.id('posts'),
    excerpt: v.string(),
  }),
  v.object({
    ...activityBaseFields,
    kind: v.literal('release'),
    releaseId: v.id('project_releases'),
    tag: v.string(),
    name: optionalStringValidator,
  }),
)

type Located = {
  project: Doc<'projects'>
  owner: Doc<'users'>
  city: Doc<'cities'>
}

/**
 * Cached loaders for one request: each project, user and city is read once
 * however many rows name it.
 */
function createLoaders(ctx: QueryCtx) {
  const cache = new Map<string, Promise<unknown>>()
  const load = <T>(id: Id<'projects' | 'users' | 'cities'>) => {
    const key = String(id)
    let value = cache.get(key)
    if (!value) {
      value = ctx.db.get(id)
      cache.set(key, value)
    }
    return value as Promise<T | null>
  }

  return {
    user: (id: Id<'users'>) => load<Doc<'users'>>(id),
    /**
     * A visible project whose live owner is discoverable and discloses an
     * exact city, with that city; null otherwise. Region-only and hidden
     * owners never reach the map.
     */
    located: async (projectId: Id<'projects'>): Promise<Located | null> => {
      const project = await load<Doc<'projects'>>(projectId)
      if (!project?.locatic.isVisible) {
        return null
      }
      const owner = await load<Doc<'users'>>(project.ownerId)
      if (!owner || !isOwnerDiscoverable(owner) || !owner.profile.cityId) {
        return null
      }
      const city = await load<Doc<'cities'>>(owner.profile.cityId)
      return resolveLocationDisclosure(owner, city).kind === 'city' && city
        ? { project, owner, city }
        : null
    },
  }
}

function isActiveUser(user: Doc<'users'> | null): user is Doc<'users'> {
  return Boolean(user && !user.deletedAt && !user.deactivatedAt)
}

function toBaseFields(
  { project, city }: Located,
  actor: Doc<'users'>,
  key: string,
  at: number,
) {
  return {
    key,
    at,
    actor: {
      name: actor.profile.displayName,
      handle: actor.github.username,
      avatarUrl: actor.profile.avatarUrl,
    },
    project: {
      owner: resolveProjectOwnerLogin(project),
      repo: project.github.name,
      description: project.github.description,
    },
    city: {
      name: city.name,
      slug: city.slug,
      lat: city.location.lat,
      lng: city.location.lng,
    },
  }
}

/** One line of a post body, cut at a word near `POST_EXCERPT_LENGTH`. */
export function toPostExcerpt(body: string): string {
  const line = body.replace(/\s+/g, ' ').trim()
  if (line.length <= POST_EXCERPT_LENGTH) {
    return line
  }
  const cut = line.slice(0, POST_EXCERPT_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > POST_EXCERPT_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * Public activity for the landing globe (plan item D7): the newest posts,
 * published releases, pushes ("shipped") and newly shared projects, newest
 * first, at most `LANDING_ACTIVITY_PER_ACTOR` per builder. There is no time
 * window, so older work fills in while little is new. Only visible projects whose live
 * owner is discoverable and discloses an exact city appear, placed on that
 * city. A project pushed since it was shared shows as shipped, not as shared.
 * Four bounded indexed reads plus cached lookups. Public and
 * viewer-independent: the landing never reads auth.
 */
export const listRecentActivity = query({
  args: {},
  returns: v.array(landingActivityValidator),
  handler: async (ctx) => {
    const loaders = createLoaders(ctx)

    const [posts, releases, projects, pushed] = await Promise.all([
      ctx.db
        .query('posts')
        .withIndex('by_deleted_created', (query) => query.eq('deletedAt', null))
        .order('desc')
        .take(POST_READ_LIMIT),
      ctx.db
        .query('project_releases')
        .withIndex('by_published')
        .order('desc')
        .take(RELEASE_READ_LIMIT),
      ctx.db
        .query('projects')
        .withIndex('by_explore_eligible_added', (query) =>
          query.eq('exploreOwner.isEligible', true),
        )
        .order('desc')
        .take(PROJECT_READ_LIMIT),
      ctx.db
        .query('projects')
        .withIndex('by_explore_eligible_last_commit', (query) =>
          query.eq('exploreOwner.isEligible', true),
        )
        .order('desc')
        .take(PUSH_READ_LIMIT),
    ])
    // Pushed after it was shared: the push is the news.
    const shipped = pushed.filter(
      (project) => project.github.lastCommitAt > project.addedToLocaticAt,
    )
    const shippedIds = new Set(shipped.map((project) => String(project._id)))

    const items = (
      await Promise.all([
        ...posts.map(async (post) => {
          const [located, actor] = await Promise.all([
            loaders.located(post.projectId),
            loaders.user(post.actorId),
          ])
          if (!located || !isActiveUser(actor)) {
            return null
          }
          return {
            ...toBaseFields(located, actor, `post:${post._id}`, post.createdAt),
            kind: 'post' as const,
            postId: post._id,
            excerpt: toPostExcerpt(post.body),
          }
        }),
        ...releases.map(async (release) => {
          if (release.isDraft || release.publishedAt === null) {
            return null
          }
          const located = await loaders.located(release.projectId)
          if (!located) {
            return null
          }
          return {
            ...toBaseFields(
              located,
              located.owner,
              `release:${release._id}`,
              release.publishedAt,
            ),
            kind: 'release' as const,
            releaseId: release._id,
            tag: release.tagName,
            name: release.name,
          }
        }),
        ...shipped.map(async (project) => {
          const located = await loaders.located(project._id)
          if (!located) {
            return null
          }
          return {
            ...toBaseFields(
              located,
              located.owner,
              `push:${project._id}`,
              project.github.lastCommitAt,
            ),
            kind: 'push' as const,
          }
        }),
        ...projects.map(async (project) => {
          if (shippedIds.has(String(project._id))) {
            return null
          }
          const located = await loaders.located(project._id)
          if (!located) {
            return null
          }
          return {
            ...toBaseFields(
              located,
              located.owner,
              `project:${project._id}`,
              project.addedToLocaticAt,
            ),
            kind: 'project' as const,
          }
        }),
      ])
    ).filter((item) => item !== null)

    items.sort((left, right) => right.at - left.at)

    const perActor = new Map<string, number>()
    const recent: typeof items = []
    for (const item of items) {
      const count = perActor.get(item.actor.handle) ?? 0
      if (count >= LANDING_ACTIVITY_PER_ACTOR) {
        continue
      }
      perActor.set(item.actor.handle, count + 1)
      recent.push(item)
      if (recent.length === LANDING_ACTIVITY_LIMIT) {
        break
      }
    }
    return recent
  },
})
