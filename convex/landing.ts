import { v, type Infer } from 'convex/values'

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
 * Most index rows the activity scan reads across its four sources. Rows of
 * hidden projects, owners who left discovery, region-only owners and capped
 * builders are skipped and the scan reads on, so older eligible work still
 * fills the globe; the budget keeps that bounded.
 */
const LANDING_SCAN_BUDGET = 400
/**
 * Read headroom, in bytes, the scan keeps below Convex's per-transaction read
 * limit (16 MiB). Project rows carry README previews, so 400 rows can exceed
 * it. The scan stops before reading on with less than this left: room for the
 * four sources' next index rows and the project, owner and city lookups they
 * trigger, each document at most 1 MiB.
 */
const LANDING_READ_HEADROOM_BYTES = 8 * 1024 * 1024
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

type LandingActivity = Infer<typeof landingActivityValidator>

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
    /** Caches a project the scan already read from an index. */
    prime: (project: Doc<'projects'>) => {
      const key = String(project._id)
      if (!cache.has(key)) {
        cache.set(key, Promise.resolve(project))
      }
    },
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

/** An index row the scan has read: when it happened, and what it is. */
type Candidate =
  | { kind: 'post'; at: number; post: Doc<'posts'> }
  | { kind: 'release'; at: number; release: Doc<'project_releases'> }
  | { kind: 'project' | 'push'; at: number; project: Doc<'projects'> }

/**
 * Merges sources that each yield newest first into one stream, newest
 * first. Sources are read lazily: the one just yielded from advances only
 * when the next item is asked for, so a consumer that stops reads no
 * further.
 */
async function* newestFirst(
  sources: ReadonlyArray<AsyncIterable<Candidate>>,
): AsyncGenerator<Candidate> {
  const iterators = sources.map((source) => source[Symbol.asyncIterator]())
  // Per source: its next candidate, null once it is done, undefined while
  // it has not been read.
  const heads: Array<Candidate | null | undefined> = iterators.map(
    () => undefined,
  )
  for (;;) {
    await Promise.all(
      iterators.map(async (iterator, index) => {
        if (heads[index] === undefined) {
          heads[index] = (await iterator.next()).value ?? null
        }
      }),
    )
    let newest: number | null = null
    heads.forEach((head, index) => {
      const current = newest === null ? null : heads[newest]
      if (head && (!current || head.at > current.at)) {
        newest = index
      }
    })
    if (newest === null) {
      return
    }
    const head = heads[newest]!
    heads[newest] = undefined
    yield head
  }
}

/**
 * Whether a merged row is news: a release that is not a draft, and each
 * project once, from the source its own timestamps choose. Pushed after it
 * was shared, it is shipped (the last-commit source); otherwise it is shared
 * (the added source).
 */
function isCandidateNews(candidate: Candidate): boolean {
  switch (candidate.kind) {
    case 'post':
      return true
    case 'release':
      return !candidate.release.isDraft
    case 'project':
    case 'push': {
      const { lastCommitAt } = candidate.project.github
      const pushed = lastCommitAt > candidate.project.addedToLocaticAt
      return candidate.kind === 'push' ? pushed : !pushed
    }
  }
}

/**
 * Public activity for the landing globe (plan item D7): the newest posts,
 * published releases, pushes ("shipped") and newly shared projects, newest
 * first, at most `LANDING_ACTIVITY_PER_ACTOR` per builder. There is no time
 * window, so older work fills in while little is new. Only visible projects
 * whose live owner is discoverable and discloses an exact city appear, placed
 * on that city.
 *
 * A project is one item, classified by its own timestamps: shipped at its
 * last push when it was pushed after it was shared, else shared when it was
 * added. The four indexes are read lazily and merged newest first, skipping
 * rows that fail the privacy checks or the builder cap, until the globe is
 * full, `LANDING_SCAN_BUDGET` rows have been read, or the bytes read near the
 * transaction limit (`LANDING_READ_HEADROOM_BYTES`); project, owner and city
 * reads are cached, and a project read from an index is not read again. Public and viewer-independent: the landing never reads
 * auth.
 */
export const listRecentActivity = query({
  args: {},
  returns: v.array(landingActivityValidator),
  handler: async (ctx) => {
    const loaders = createLoaders(ctx)

    // Every index row read counts, including rows a source skips. Rows are
    // bounded by count and by bytes: both are checked before the next read.
    let budget = LANDING_SCAN_BUDGET
    async function hasReadHeadroom() {
      const { bytesRead } = await ctx.meta.getTransactionMetrics()
      return bytesRead.remaining > LANDING_READ_HEADROOM_BYTES
    }
    async function* budgeted<T>(rows: AsyncIterable<T>): AsyncGenerator<T> {
      const iterator = rows[Symbol.asyncIterator]()
      while (budget > 0 && (await hasReadHeadroom())) {
        const next = await iterator.next()
        if (next.done) {
          return
        }
        budget--
        yield next.value
      }
    }

    const posts = budgeted(
      ctx.db
        .query('posts')
        .withIndex('by_deleted_created', (query) => query.eq('deletedAt', null))
        .order('desc'),
    )
    const releases = budgeted(
      ctx.db.query('project_releases').withIndex('by_published').order('desc'),
    )
    const added = budgeted(
      ctx.db
        .query('projects')
        .withIndex('by_explore_eligible_added', (query) =>
          query.eq('exploreOwner.isEligible', true),
        )
        .order('desc'),
    )
    const pushed = budgeted(
      ctx.db
        .query('projects')
        .withIndex('by_explore_eligible_last_commit', (query) =>
          query.eq('exploreOwner.isEligible', true),
        )
        .order('desc'),
    )

    // Each source yields every row it reads, one at a time, by its index
    // timestamp: a source never reads ahead to find a row it wants, so none
    // can spend the budget while the merge waits on it. Rows are judged
    // after the merge picks them (`isCandidateNews`).
    async function* postCandidates(): AsyncGenerator<Candidate> {
      for await (const post of posts) {
        yield { kind: 'post', at: post.createdAt, post }
      }
    }
    async function* releaseCandidates(): AsyncGenerator<Candidate> {
      for await (const release of releases) {
        // Unpublished releases sort last: nothing published follows.
        if (release.publishedAt === null) {
          return
        }
        yield { kind: 'release', at: release.publishedAt, release }
      }
    }
    async function* sharedCandidates(): AsyncGenerator<Candidate> {
      for await (const project of added) {
        loaders.prime(project)
        yield { kind: 'project', at: project.addedToLocaticAt, project }
      }
    }
    async function* shippedCandidates(): AsyncGenerator<Candidate> {
      for await (const project of pushed) {
        loaders.prime(project)
        yield { kind: 'push', at: project.github.lastCommitAt, project }
      }
    }

    async function toItem(
      candidate: Candidate,
    ): Promise<LandingActivity | null> {
      switch (candidate.kind) {
        case 'post': {
          const { post } = candidate
          const [located, actor] = await Promise.all([
            loaders.located(post.projectId),
            loaders.user(post.actorId),
          ])
          if (!located || !isActiveUser(actor)) {
            return null
          }
          return {
            ...toBaseFields(located, actor, `post:${post._id}`, candidate.at),
            kind: 'post',
            postId: post._id,
            excerpt: toPostExcerpt(post.body),
          }
        }
        case 'release': {
          const { release } = candidate
          const located = await loaders.located(release.projectId)
          if (!located) {
            return null
          }
          return {
            ...toBaseFields(
              located,
              located.owner,
              `release:${release._id}`,
              candidate.at,
            ),
            kind: 'release',
            releaseId: release._id,
            tag: release.tagName,
            name: release.name,
          }
        }
        case 'project':
        case 'push': {
          const { project, kind } = candidate
          const located = await loaders.located(project._id)
          if (!located) {
            return null
          }
          return {
            ...toBaseFields(
              located,
              located.owner,
              `${kind}:${project._id}`,
              candidate.at,
            ),
            kind,
          }
        }
      }
    }

    const perActor = new Map<string, number>()
    const recent: LandingActivity[] = []
    for await (const candidate of newestFirst([
      postCandidates(),
      releaseCandidates(),
      sharedCandidates(),
      shippedCandidates(),
    ])) {
      if (!isCandidateNews(candidate)) {
        continue
      }
      const item = await toItem(candidate)
      if (!item) {
        continue
      }
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
