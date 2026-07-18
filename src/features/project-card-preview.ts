import type { ProjectCardData } from '@/components/ui/project-card'
import type {
  ProjectCardPreview,
  ProjectRouteParams,
} from '@/features/contracts'
import { relativeTime } from '@/lib/time'

export function getProjectCardId(project: ProjectCardPreview) {
  return String(project.projectId)
}

export function getProjectCardDbId(project: ProjectCardPreview) {
  return project.projectId
}

export function getProjectCardOwner(project: ProjectCardPreview) {
  return project.owner
}

export function getProjectCardRepo(project: ProjectCardPreview) {
  return project.repo
}

export function getProjectCardRouteParams(
  project: ProjectCardPreview,
): ProjectRouteParams {
  return {
    owner: project.owner,
    repo: project.repo,
  }
}

export function getProjectCardFullName(project: ProjectCardPreview) {
  return project.fullName
}

export function toProjectCardData(
  project: ProjectCardPreview,
): ProjectCardData {
  return {
    id: String(project.projectId),
    owner: project.owner,
    repo: project.repo,
    fullName: project.fullName,
    description: project.description,
    lang: project.primaryLanguage,
    languages: project.languages,
    lastCommitLabel: relativeTime(project.lastCommitAt),
    githubStars: project.githubStars,
    locaticLikes: project.locaticLikes,
    reactionCounts: project.reactionCounts ?? { like: project.locaticLikes },
    viewerReactionTypes: project.viewerReactionTypes,
    commentsCount: project.commentsCount,
    postsCount: project.postsCount,
    topics: project.topics,
    authorName: project.authorName,
    authorHandle: project.authorHandle,
    authorAvatarUrl: project.authorAvatarUrl,
    city: project.cityLabel,
  }
}
