import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type {
  ProjectCardPreview,
  ViewerLikedProjectIdsPayload,
} from '@/features/contracts'

export type HomeFeedEventType =
  | 'project_posted'
  | 'post_created'
  | 'project_liked'
  | 'project_commented'
  | 'post_commented'
  | 'followed'
  | 'contributor_matched'

export type HomeFeedTargetBase = {
  isOpenable?: boolean
}

export type HomeFeedProjectTarget = HomeFeedTargetBase & {
  kind: 'project'
  projectId: Id<'projects'>
  projectSnapshot: NonNullable<Doc<'home_feed_items'>['projectSnapshot']>
  project?: Doc<'projects'> | null
  projectPreview?: ProjectCardPreview | null
}

export type HomeFeedPostTarget = HomeFeedTargetBase & {
  kind: 'post'
  projectId: Id<'projects'>
  postId: Id<'posts'>
  projectSnapshot: NonNullable<Doc<'home_feed_items'>['projectSnapshot']>
  postSnapshot: Doc<'home_feed_items'>['postSnapshot']
  project?: Doc<'projects'> | null
  projectPreview?: ProjectCardPreview | null
}

export type HomeFeedCommentTarget = HomeFeedTargetBase & {
  kind: 'comment'
  projectId: Id<'projects'>
  postId: Id<'posts'> | null
  commentId: Id<'comments'>
  rootCommentId?: Id<'comments'>
  ancestorCommentIds?: Array<Id<'comments'>>
  targetType: 'project' | 'post'
  content: string
  targetLabel: string
  projectSnapshot: NonNullable<Doc<'home_feed_items'>['projectSnapshot']>
  postSnapshot?: Doc<'home_feed_items'>['postSnapshot']
  project?: Doc<'projects'> | null
  projectPreview?: ProjectCardPreview | null
}

export type HomeFeedProfileTarget = HomeFeedTargetBase & {
  kind: 'profile'
  profile: {
    userId: Id<'users'>
    githubUsername: string
    displayName: string
    avatarUrl: string | null
    cityName: string | null
  }
}

export type HomeFeedPullRequestTarget = HomeFeedTargetBase & {
  kind: 'pull_request'
  projectId: Id<'projects'>
  projectSnapshot: NonNullable<Doc<'home_feed_items'>['projectSnapshot']>
  title: string
  number: number
  url: string | null
  mergedAt: number | null
  project?: Doc<'projects'> | null
  projectPreview?: ProjectCardPreview | null
}

export type HomeFeedTarget =
  | HomeFeedProjectTarget
  | HomeFeedPostTarget
  | HomeFeedCommentTarget
  | HomeFeedProfileTarget
  | HomeFeedPullRequestTarget

type ProjectBackedHomeFeedTarget =
  | HomeFeedProjectTarget
  | HomeFeedPostTarget
  | HomeFeedCommentTarget
  | HomeFeedPullRequestTarget

export type HomeFeedItem = Omit<
  Doc<'home_feed_items'>,
  | 'eventType'
  | 'rowKind'
  | 'groupKind'
  | 'target'
  | 'previewTargets'
  | 'projectSnapshot'
> & {
  eventType: HomeFeedEventType
  rowKind?: 'single_event' | 'event_group'
  groupKind?: HomeFeedEventType
  eventCount?: number
  firstEventAt?: number
  latestEventAt?: number
  target?: HomeFeedTarget | null
  previewTargets?: HomeFeedTarget[]
  project: Doc<'projects'> | null
  projectPreview: ProjectCardPreview | null
  projectSnapshot: NonNullable<Doc<'home_feed_items'>['projectSnapshot']> | null
  /**
   * The actor's current GitHub login for the profile link; absent when the
   * payload does not carry it or the actor is gone (the row then shows the
   * actor without a link).
   */
  actorGithubUsername?: string | null
}

export type HomeFeedPage = {
  page: HomeFeedItem[]
  continueCursor: string
  isDone: boolean
}

function isProjectBackedTarget(
  target: HomeFeedTarget | null | undefined,
): target is ProjectBackedHomeFeedTarget {
  return Boolean(target && 'projectId' in target)
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
      const itemMatchesProject = String(item.projectId) === projectId
      const matchingPreviewTarget = item.previewTargets?.find(
        (target): target is ProjectBackedHomeFeedTarget =>
          isProjectBackedTarget(target) &&
          String(target.projectId) === projectId,
      )
      const matchingTarget =
        isProjectBackedTarget(item.target) &&
        String(item.target.projectId) === projectId
          ? item.target
          : null
      const likesSource =
        matchingPreviewTarget ??
        matchingTarget ??
        (itemMatchesProject ? item : null)

      if (!likesSource || !likesSource.projectSnapshot) {
        return item
      }

      const currentlyLiked = likedProjectIds.has(projectId)
      const delta = nextLiked === currentlyLiked ? 0 : nextLiked ? 1 : -1
      const nextLikesCount = likesSource.project
        ? Math.max(0, likesSource.project.locatic.likesCount + delta)
        : Math.max(0, likesSource.projectSnapshot.likesCount + delta)
      const updateTargetLikes = (target: HomeFeedTarget) => {
        if (
          !isProjectBackedTarget(target) ||
          String(target.projectId) !== projectId
        ) {
          return target
        }

        return {
          ...target,
          project: target.project
            ? {
                ...target.project,
                locatic: {
                  ...target.project.locatic,
                  likesCount: nextLikesCount,
                },
              }
            : target.project,
          projectPreview: target.projectPreview
            ? {
                ...target.projectPreview,
                locaticLikes: nextLikesCount,
              }
            : target.projectPreview,
          projectSnapshot: {
            ...target.projectSnapshot,
            likesCount: nextLikesCount,
          },
        }
      }

      return {
        ...item,
        project:
          itemMatchesProject && item.project
            ? {
                ...item.project,
                locatic: {
                  ...item.project.locatic,
                  likesCount: nextLikesCount,
                },
              }
            : item.project,
        projectPreview:
          itemMatchesProject && item.projectPreview
            ? {
                ...item.projectPreview,
                locaticLikes: nextLikesCount,
              }
            : item.projectPreview,
        projectSnapshot:
          itemMatchesProject && item.projectSnapshot
            ? {
                ...item.projectSnapshot,
                likesCount: nextLikesCount,
              }
            : item.projectSnapshot,
        previewTargets: item.previewTargets?.map(updateTargetLikes),
        target: item.target ? updateTargetLikes(item.target) : item.target,
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
