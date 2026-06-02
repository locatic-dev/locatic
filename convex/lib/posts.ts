import type { QueryCtx, MutationCtx } from '../_generated/server'
import type { Doc } from './types'
import { getProjectTopics } from './topics'

type DbCtx = Pick<QueryCtx | MutationCtx, 'db'>

export async function getVisiblePostProject(
  ctx: DbCtx,
  post: Doc<'posts'>,
): Promise<Doc<'projects'> | null> {
  const project = await ctx.db.get(post.projectId)
  if (!project?.locatic.isVisible || !project.exploreOwner.isEligible) {
    return null
  }

  const owner = await ctx.db.get(project.ownerId)
  if (!owner || owner.deletedAt !== null || owner.deactivatedAt !== null) {
    return null
  }

  return project
}

export async function isPublicPostVisible(ctx: DbCtx, post: Doc<'posts'>) {
  return Boolean(await getVisiblePostProject(ctx, post))
}

export async function withCurrentProjectPostFields(
  ctx: DbCtx,
  post: Doc<'posts'>,
) {
  const project = await getVisiblePostProject(ctx, post)
  if (!project) {
    return null
  }

  return {
    ...post,
    projectCityId: project.exploreOwner.cityId,
    projectTopics: getProjectTopics(project),
    projectSnapshot: {
      name: project.github.name,
      fullName: project.github.fullName,
      primaryLanguage: project.github.primaryLanguage,
      languages: project.github.languages,
    },
  }
}

export async function filterVisiblePosts(
  ctx: DbCtx,
  posts: Array<Doc<'posts'>>,
) {
  const visiblePosts = await Promise.all(
    posts.map((post) => withCurrentProjectPostFields(ctx, post)),
  )

  return visiblePosts.filter(
    (post): post is NonNullable<typeof post> => post !== null,
  )
}
