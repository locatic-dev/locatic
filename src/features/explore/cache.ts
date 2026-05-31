import type { Id } from '../../../convex/_generated/dataModel'
import type { ViewerLikedProjectIdsPayload } from '@/features/contracts'
import type { ExploreFeedPayload } from './types'

export function updateExploreFeedPayload(
  payload: ExploreFeedPayload | undefined,
  projectId: Id<'projects'>,
  currentlyLiked: boolean,
  nextLiked: boolean,
) {
  if (!payload) {
    return payload
  }

  const delta = nextLiked === currentlyLiked ? 0 : nextLiked ? 1 : -1

  return {
    ...payload,
    projects: payload.projects.map((project) =>
      project.projectId === projectId
        ? {
            ...project,
            locaticLikes: Math.max(0, project.locaticLikes + delta),
          }
        : project,
    ),
  }
}

export function updateLikedProjectIdsPayload(
  payload: ViewerLikedProjectIdsPayload | undefined,
  projectId: Id<'projects'>,
  nextLiked: boolean,
) {
  if (!payload) {
    return payload
  }

  const likedProjectIds = new Set(payload.likedProjectIds)
  if (nextLiked) {
    likedProjectIds.add(projectId)
  } else {
    likedProjectIds.delete(projectId)
  }

  return {
    ...payload,
    likedProjectIds: [...likedProjectIds],
  }
}
