import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import type { Doc } from './types'
import { resolveProjectOwnerLogin } from './project_route'

type Reader = DatabaseReader | DatabaseWriter

export type ProjectCardPreviewAudience = 'private' | 'public'

export type ProjectCardPreviewRecord = {
  projectId: Doc<'projects'>['_id']
  ownerUserId: Doc<'users'>['_id']
  fullName: string
  owner: string
  repo: string
  description: string | null
  primaryLanguage: string | null
  languages: Doc<'projects'>['github']['languages']
  githubStars: number
  locaticLikes: number
  commentsCount: number
  postsCount: number
  topics: string[]
  lastCommitAt: number
  updatedAt: number
  authorName: string
  authorHandle: string
  authorAvatarUrl: string | null
  cityLabel: string | null
  cityVisibilityState: 'exact_city' | 'region_only' | 'hidden' | 'unset'
}

async function getCurrentCityName(
  db: Reader,
  owner: Doc<'users'>,
): Promise<string | null> {
  if (!owner.profile.cityId) {
    return null
  }

  const city = await db.get(owner.profile.cityId)
  return city?.displayName ?? null
}

export function resolvePublicCityLabel(
  owner: Doc<'users'>,
  cityName: string | null,
) {
  switch (owner.privacy.cityVisibility) {
    case 'hidden':
      return null
    case 'region_only':
      return cityName?.split(',').slice(1).join(',').trim() || null
    case 'exact_city':
    default:
      return cityName
  }
}

export async function buildProjectCardPreview(
  db: Reader,
  project: Doc<'projects'>,
  args: {
    audience: ProjectCardPreviewAudience
    owner?: Doc<'users'>
  },
): Promise<ProjectCardPreviewRecord> {
  const owner = args.owner ?? (await db.get(project.ownerId))
  if (!owner) {
    throw new Error(`Owner not found for project ${project.github.fullName}`)
  }

  const ownerHandle = owner.github.username
  const routeOwner = resolveProjectOwnerLogin(project)
  const ownerDisplayName = owner.profile.displayName
  const currentCityName = await getCurrentCityName(db, owner)

  let cityLabel: string | null = null
  let cityVisibilityState: ProjectCardPreviewRecord['cityVisibilityState'] =
    'unset'

  if (args.audience === 'private') {
    cityLabel = currentCityName
    cityVisibilityState = currentCityName ? 'exact_city' : 'unset'
  } else {
    cityLabel = resolvePublicCityLabel(owner, currentCityName)
    cityVisibilityState = currentCityName
      ? owner.privacy.cityVisibility
      : 'unset'
  }

  return {
    projectId: project._id,
    ownerUserId: project.ownerId,
    fullName: project.github.fullName,
    owner: routeOwner,
    repo: project.github.name,
    description: project.github.description,
    primaryLanguage: project.github.primaryLanguage,
    languages: project.github.languages,
    githubStars: project.github.stargazersCount,
    locaticLikes: project.locatic.likesCount,
    commentsCount: project.locatic.commentsCount,
    postsCount: project.locatic.postsCount ?? 0,
    topics: project.locatic.tags,
    lastCommitAt: project.github.lastCommitAt,
    updatedAt: project.updatedAt,
    authorName: ownerDisplayName,
    authorHandle: ownerHandle,
    authorAvatarUrl: owner.profile.avatarUrl,
    cityLabel,
    cityVisibilityState,
  }
}
