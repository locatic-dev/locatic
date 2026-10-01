import type { Id } from '../_generated/dataModel'
import type { QueryCtx, MutationCtx } from '../_generated/server'
import type { Doc } from './types'
import { getProjectTopics } from './topics'
import { resolveProjectOwnerLogin } from './project_route'
import { getPostCityId, isOwnerDiscoverable } from './snapshots'
import { resolveLocationDisclosure, toSnapshotLocation } from './visibility'

type DbCtx = Pick<QueryCtx | MutationCtx, 'db'>

export function buildPostSearchText({
  body,
  projectFullName,
  topics,
}: {
  body: string
  projectFullName: string
  topics: string[]
}) {
  return [
    body,
    projectFullName,
    ...topics.flatMap((topic) => [topic, `#${topic}`]),
  ]
    .join(' ')
    .toLowerCase()
}

export function normalizePostSearchQuery(query: string) {
  return query.trim().toLowerCase().replace(/^#+/, '')
}

type PostProjectState = {
  project: Doc<'projects'>
  owner: Doc<'users'>
}

type CityLoader = (cityId: Id<'cities'>) => Promise<Doc<'cities'> | null>

/** One read per distinct city for a batch of posts. */
function createCityLoader(ctx: DbCtx): CityLoader {
  const cities = new Map<string, Promise<Doc<'cities'> | null>>()
  return (cityId) => {
    const key = String(cityId)
    let city = cities.get(key)
    if (!city) {
      city = ctx.db.get(cityId)
      cities.set(key, city)
    }
    return city
  }
}

async function loadVisiblePostProject(
  ctx: DbCtx,
  post: Doc<'posts'>,
): Promise<PostProjectState | null> {
  const project = await ctx.db.get(post.projectId)
  if (!project?.locatic.isVisible) {
    return null
  }

  const owner = await ctx.db.get(project.ownerId)
  if (!owner || owner.deletedAt !== null || owner.deactivatedAt !== null) {
    return null
  }

  return { project, owner }
}

export async function getVisiblePostProject(
  ctx: DbCtx,
  post: Doc<'posts'>,
): Promise<Doc<'projects'> | null> {
  return (await loadVisiblePostProject(ctx, post))?.project ?? null
}

export async function isPublicPostVisible(ctx: DbCtx, post: Doc<'posts'>) {
  return Boolean(await loadVisiblePostProject(ctx, post))
}

/**
 * A visible post with the fields that depend on its project, owner and actor
 * as they are now, not as they were stored: `projectCityId` from the live
 * owner (`getPostCityId`), the project's topics and snapshot, and the actor's
 * location under the visibility policy (`actorSnapshot.cityId/cityName`), so
 * a privacy or discovery change applies before the stored rows are
 * re-derived.
 */
async function toCurrentPostFields(
  ctx: DbCtx,
  post: Doc<'posts'>,
  { project, owner }: PostProjectState,
  loadCity: CityLoader,
) {
  const actor =
    String(post.actorId) === String(owner._id)
      ? owner
      : await ctx.db.get(post.actorId)
  const actorCity = actor?.profile.cityId
    ? await loadCity(actor.profile.cityId)
    : null
  const actorLocation = actor
    ? toSnapshotLocation(resolveLocationDisclosure(actor, actorCity))
    : { cityId: null, cityName: null }
  const projectTopics = getProjectTopics(project)

  return {
    ...post,
    projectCityId: getPostCityId(owner),
    projectTopics,
    searchText: buildPostSearchText({
      body: post.body,
      projectFullName: project.github.fullName,
      topics: projectTopics,
    }),
    actorSnapshot: {
      ...post.actorSnapshot,
      cityId: actorLocation.cityId,
      cityName: actorLocation.cityName,
    },
    projectSnapshot: {
      name: project.github.name,
      fullName: project.github.fullName,
      ownerLogin: resolveProjectOwnerLogin(project),
      primaryLanguage: project.github.primaryLanguage,
      languages: project.github.languages,
    },
  }
}

export async function withCurrentProjectPostFields(
  ctx: DbCtx,
  post: Doc<'posts'>,
) {
  const state = await loadVisiblePostProject(ctx, post)
  return state
    ? await toCurrentPostFields(ctx, post, state, createCityLoader(ctx))
    : null
}

async function loadCurrentPosts(
  ctx: DbCtx,
  posts: Array<Doc<'posts'>>,
  { discoverableOnly }: { discoverableOnly: boolean },
) {
  const loadCity = createCityLoader(ctx)
  const currentPosts = await Promise.all(
    posts.map(async (post) => {
      const state = await loadVisiblePostProject(ctx, post)
      if (!state || (discoverableOnly && !isOwnerDiscoverable(state.owner))) {
        return null
      }
      return await toCurrentPostFields(ctx, post, state, loadCity)
    }),
  )

  return currentPosts.filter(
    (post): post is NonNullable<typeof post> => post !== null,
  )
}

/**
 * Posts anyone may see (project visible, owner active), with current
 * project, owner and actor fields. For surfaces tied to one project or
 * person: the project page, profiles.
 */
export async function filterVisiblePosts(
  ctx: DbCtx,
  posts: Array<Doc<'posts'>>,
) {
  return await loadCurrentPosts(ctx, posts, { discoverableOnly: false })
}

/**
 * Posts for discovery surfaces (Explore, city pages, post search): visible
 * posts whose live owner is discoverable (`isOwnerDiscoverable`, the rule
 * behind `exploreOwner.isEligible`), so an owner who leaves discovery drops
 * out even where a stored `projectCityId` predates the change.
 */
export async function filterDiscoverablePosts(
  ctx: DbCtx,
  posts: Array<Doc<'posts'>>,
) {
  return await loadCurrentPosts(ctx, posts, { discoverableOnly: true })
}
