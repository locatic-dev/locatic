import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type {
  ProjectCardPreview,
  ViewerLikedProjectIdsPayload,
} from '@/features/contracts'

export type HomeFeedItem = Doc<'home_feed_items'> & {
  project: Doc<'projects'> | null
  projectPreview: ProjectCardPreview | null
}

export type HomeFeedPage = {
  page: HomeFeedItem[]
  continueCursor: string
  isDone: boolean
}

export function updateHomeFeedPayload(
  payload: HomeFeedPage | undefined,
  projectId: string,
  nextLiked: boolean,
  likedProjectIds: Set<string>,
) {
  if (!payload) {
    return payload
  }

  return {
    ...payload,
    page: payload.page.map((item) => {
      if (String(item.projectId) !== projectId) {
        return item
      }

      const currentlyLiked = likedProjectIds.has(projectId)
      const delta = nextLiked === currentlyLiked ? 0 : nextLiked ? 1 : -1
      const nextLikesCount = item.project
        ? Math.max(0, item.project.locatic.likesCount + delta)
        : Math.max(0, item.projectSnapshot.likesCount + delta)

      return {
        ...item,
        project: item.project
          ? {
              ...item.project,
              locatic: {
                ...item.project.locatic,
                likesCount: nextLikesCount,
              },
            }
          : item.project,
        projectPreview: item.projectPreview
          ? {
              ...item.projectPreview,
              locaticLikes: nextLikesCount,
            }
          : item.projectPreview,
        projectSnapshot: {
          ...item.projectSnapshot,
          likesCount: nextLikesCount,
        },
      }
    }),
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
