import type { Doc } from './types'
import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import { resolveProjectOwnerLogin } from './project_route'

type Reader = DatabaseReader | DatabaseWriter

async function getCityName(
  db: Reader,
  cityId: Doc<'users'>['profile']['cityId'],
): Promise<string | null> {
  if (!cityId) {
    return null
  }

  const city = await db.get(cityId)
  return city?.displayName ?? null
}

export async function buildActorSnapshot(db: Reader, user: Doc<'users'>) {
  return {
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl,
    cityId: user.profile.cityId,
    cityName: await getCityName(db, user.profile.cityId),
  }
}

export async function buildOwnerSnapshot(db: Reader, user: Doc<'users'>) {
  return {
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl,
    cityId: user.profile.cityId,
    cityName: await getCityName(db, user.profile.cityId),
    buildStatus: user.profile.buildStatus,
  }
}

export function buildProjectExploreOwner(
  user: Doc<'users'>,
  isVisible: boolean,
) {
  const isOwnerActive = !user.deletedAt && !user.deactivatedAt
  const hasCity = user.profile.cityId !== null

  return {
    cityId: user.profile.cityId,
    appearInExplore: user.appearInExplore,
    isActive: isOwnerActive,
    isEligible: isVisible && isOwnerActive && user.appearInExplore && hasCity,
  }
}

export function buildProjectSnapshot(project: Doc<'projects'>) {
  return {
    name: project.github.name,
    fullName: project.github.fullName,
    ownerLogin: resolveProjectOwnerLogin(project),
    description: project.github.description,
    primaryLanguage: project.github.primaryLanguage,
    languages: project.github.languages,
    likesCount: project.locatic.likesCount,
    commentsCount: project.locatic.commentsCount,
    stargazersCount: project.github.stargazersCount,
    ownerId: project.ownerId,
    ownerDisplayName: project.ownerSnapshot.displayName,
    ownerAvatarUrl: project.ownerSnapshot.avatarUrl,
    cityId: project.ownerSnapshot.cityId,
    cityName: project.ownerSnapshot.cityName,
  }
}

export function buildPostSnapshot(post: Doc<'posts'>) {
  return {
    body: post.body,
    reactionCounts: post.reactionCounts,
    commentsCount: post.commentsCount,
  }
}
