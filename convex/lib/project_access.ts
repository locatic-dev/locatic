import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { Doc } from './types'

type DbCtx = Pick<QueryCtx | MutationCtx, 'db'>

export async function isProjectPubliclyInteractable(
  ctx: DbCtx,
  project: Doc<'projects'> | null,
) {
  if (!project?.locatic.isVisible) {
    return false
  }

  const owner = await ctx.db.get(project.ownerId)
  return Boolean(
    owner && owner.deletedAt === null && owner.deactivatedAt === null,
  )
}

export async function getPubliclyInteractableProject(
  ctx: DbCtx,
  projectId: Id<'projects'>,
) {
  const project = await ctx.db.get(projectId)
  return (await isProjectPubliclyInteractable(ctx, project)) ? project : null
}

export async function isCommentPubliclyInteractable(
  ctx: DbCtx,
  comment: Doc<'comments'> | null,
) {
  if (!comment || comment.isDeleted) {
    return false
  }

  if (comment.targetType === 'project') {
    const projectId = ctx.db.normalizeId('projects', comment.targetId)
    return projectId
      ? Boolean(await getPubliclyInteractableProject(ctx, projectId))
      : false
  }

  if (comment.targetType === 'post') {
    const postId = ctx.db.normalizeId('posts', comment.targetId)
    const post = postId ? await ctx.db.get(postId) : null
    if (!post || post.deletedAt !== null) {
      return false
    }

    return Boolean(await getPubliclyInteractableProject(ctx, post.projectId))
  }

  return false
}
