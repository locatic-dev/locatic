import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type {
  PrivateProfileOverviewPayload,
  ProjectCardPreview,
  PublicProfileOverviewPayload,
} from '@/features/contracts'

export type GithubRepositoryManagerRecord = {
  fullName: string
  name: string
  description: string | null
  primaryLanguage: string | null
  stargazersCount: number
}

export type RepositoryManagerStatus = 'on_profile' | 'hidden' | 'available'

export type RepositoryManagerItem = {
  fullName: string
  name: string
  description: string | null
  primaryLanguage: string | null
  stargazersCount: number
  projectId: Id<'projects'> | null
  status: RepositoryManagerStatus
  isPinned: boolean
  isMissingFromGithub: boolean
  updatedAt: number | null
}

const STATUS_ORDER: Record<RepositoryManagerStatus, number> = {
  on_profile: 0,
  hidden: 1,
  available: 2,
}

export function getRepositoryViewQueryKeys(args: {
  mineProjectsQueryKey: readonly unknown[]
  privateProfileOverviewQueryKey: readonly unknown[]
  privateProfileProjectsQueryKey: readonly unknown[]
  publicProfileOverviewQueryKey: readonly unknown[]
  publicProfileProjectsQueryKey: readonly unknown[]
}) {
  return [
    args.mineProjectsQueryKey,
    args.privateProfileOverviewQueryKey,
    args.privateProfileProjectsQueryKey,
    args.publicProfileOverviewQueryKey,
    args.publicProfileProjectsQueryKey,
  ] as const
}

export function buildRepositoryManagerItems({
  githubRepositories,
  pinnedProjectIds,
  projects,
}: {
  githubRepositories: GithubRepositoryManagerRecord[]
  pinnedProjectIds: Array<Id<'projects'>>
  projects: Array<Doc<'projects'>>
}) {
  const githubByFullName = new Map(
    githubRepositories.map((repository) => [repository.fullName, repository]),
  )
  const pinnedIds = new Set(pinnedProjectIds.map(String))
  const fullNames = new Set([
    ...githubRepositories.map((repository) => repository.fullName),
    ...projects.map((project) => project.github.fullName),
  ])

  const items = [...fullNames].map<RepositoryManagerItem>((fullName) => {
    const githubRepository = githubByFullName.get(fullName)
    const project =
      projects.find((candidate) => candidate.github.fullName === fullName) ??
      null

    if (project) {
      return {
        fullName,
        name: project.github.name,
        description:
          githubRepository?.description ?? project.github.description ?? null,
        primaryLanguage:
          githubRepository?.primaryLanguage ?? project.github.primaryLanguage,
        stargazersCount:
          githubRepository?.stargazersCount ?? project.github.stargazersCount,
        projectId: project._id,
        status: project.locatic.isVisible ? 'on_profile' : 'hidden',
        isPinned: pinnedIds.has(String(project._id)),
        isMissingFromGithub: !githubRepository,
        updatedAt: project.updatedAt,
      }
    }

    return {
      fullName,
      name: githubRepository?.name ?? fullName.split('/')[1] ?? fullName,
      description: githubRepository?.description ?? null,
      primaryLanguage: githubRepository?.primaryLanguage ?? null,
      stargazersCount: githubRepository?.stargazersCount ?? 0,
      projectId: null,
      status: 'available',
      isPinned: false,
      isMissingFromGithub: false,
      updatedAt: null,
    }
  })

  return items.sort((left, right) => {
    const statusDelta = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
    if (statusDelta !== 0) {
      return statusDelta
    }

    const updatedDelta = (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    if (updatedDelta !== 0) {
      return updatedDelta
    }

    const starDelta = right.stargazersCount - left.stargazersCount
    if (starDelta !== 0) {
      return starDelta
    }

    return left.fullName.localeCompare(right.fullName)
  })
}

export function filterRepositoryManagerItems(
  items: RepositoryManagerItem[],
  query: string,
) {
  const trimmedQuery = query.trim().toLowerCase()
  if (!trimmedQuery) {
    return items
  }

  return items.filter((item) => {
    const description = item.description?.toLowerCase() ?? ''
    const primaryLanguage = item.primaryLanguage?.toLowerCase() ?? ''

    return (
      item.fullName.toLowerCase().includes(trimmedQuery) ||
      item.name.toLowerCase().includes(trimmedQuery) ||
      description.includes(trimmedQuery) ||
      primaryLanguage.includes(trimmedQuery)
    )
  })
}

export function canPinRepositoryManagerItem(item: RepositoryManagerItem) {
  return item.status === 'on_profile' && item.projectId !== null
}

function compareVisibleProjects(
  left: ProjectCardPreview,
  right: ProjectCardPreview,
  pinnedIds: Set<string>,
) {
  const leftPinned = pinnedIds.has(String(left.projectId)) ? 1 : 0
  const rightPinned = pinnedIds.has(String(right.projectId)) ? 1 : 0
  if (leftPinned !== rightPinned) {
    return rightPinned - leftPinned
  }

  return right.updatedAt - left.updatedAt
}

function isPrivateOverview(
  overview: PrivateProfileOverviewPayload | PublicProfileOverviewPayload | null,
): overview is PrivateProfileOverviewPayload {
  return Boolean(overview && 'viewer' in overview)
}

export function buildOptimisticSelfProjectPreview(args: {
  audience: 'private' | 'public'
  overview: PrivateProfileOverviewPayload | PublicProfileOverviewPayload | null
  project: Doc<'projects'>
  profileUsername: string
}) {
  const fullName = args.project.github.fullName
  const routeOwner =
    args.project.github.ownerLogin ??
    args.project.github.fullName.split('/')[0] ??
    args.profileUsername
  const owner = args.profileUsername
  const privateOverview = isPrivateOverview(args.overview)
    ? args.overview
    : null
  const publicOverview =
    args.overview && !isPrivateOverview(args.overview) ? args.overview : null
  const cityLabel =
    args.audience === 'private'
      ? (privateOverview?.cityName ?? null)
      : (publicOverview?.profile.city ?? null)
  const cityVisibilityState =
    args.audience === 'private'
      ? cityLabel
        ? 'exact_city'
        : 'unset'
      : cityLabel
        ? (publicOverview?.privacy.cityVisibility ?? 'exact_city')
        : 'unset'

  return {
    projectId: args.project._id,
    ownerUserId: args.project.ownerId,
    fullName,
    owner: routeOwner,
    repo: args.project.github.name,
    description: args.project.github.description,
    primaryLanguage: args.project.github.primaryLanguage,
    languages: args.project.github.languages,
    githubStars: args.project.github.stargazersCount,
    locaticLikes: args.project.locatic.likesCount,
    commentsCount: args.project.locatic.commentsCount,
    lastCommitAt: args.project.github.lastCommitAt,
    updatedAt: args.project.updatedAt,
    authorName:
      privateOverview?.viewer.profile.displayName ??
      publicOverview?.profile.displayName ??
      args.project.ownerSnapshot.displayName,
    authorHandle: owner,
    authorAvatarUrl:
      privateOverview?.viewer.profile.avatarUrl ??
      publicOverview?.profile.avatarUrl ??
      args.project.ownerSnapshot.avatarUrl,
    cityLabel,
    cityVisibilityState,
  } satisfies ProjectCardPreview
}

export function updateMineProjectsVisibility(
  projects: Array<Doc<'projects'>> | undefined,
  projectId: Id<'projects'>,
  isVisible: boolean,
) {
  if (!projects) {
    return projects
  }

  return projects.map((project) =>
    project._id === projectId
      ? {
          ...project,
          locatic: {
            ...project.locatic,
            isVisible,
          },
        }
      : project,
  )
}

export function updateVisibleProjectPreviews(args: {
  previews: Array<ProjectCardPreview> | undefined
  project: Doc<'projects'> | undefined
  projectId: Id<'projects'>
  isVisible: boolean
  pinnedProjectIds: Array<Id<'projects'>>
  overview: PrivateProfileOverviewPayload | PublicProfileOverviewPayload | null
  audience: 'private' | 'public'
  profileUsername: string
}) {
  if (!args.previews) {
    return args.previews
  }

  const withoutProject = args.previews.filter(
    (preview) => preview.projectId !== args.projectId,
  )

  if (!args.isVisible || !args.project) {
    return withoutProject
  }

  const preview = buildOptimisticSelfProjectPreview({
    audience: args.audience,
    overview: args.overview,
    project: args.project,
    profileUsername: args.profileUsername,
  })
  const pinnedIds = new Set(args.pinnedProjectIds.map(String))

  return [...withoutProject, preview].sort((left, right) =>
    compareVisibleProjects(left, right, pinnedIds),
  )
}

export function updatePinnedProjectIds(
  currentIds: Array<Id<'projects'>>,
  projectId: Id<'projects'>,
  pinned: boolean,
) {
  const nextIds = new Set(currentIds)
  if (pinned) {
    nextIds.add(projectId)
  } else {
    nextIds.delete(projectId)
  }
  return [...nextIds]
}

export function sortVisibleProjectPreviews(
  previews: Array<ProjectCardPreview> | undefined,
  pinnedProjectIds: Array<Id<'projects'>>,
) {
  if (!previews) {
    return previews
  }

  const pinnedIds = new Set(pinnedProjectIds.map(String))
  return [...previews].sort((left, right) =>
    compareVisibleProjects(left, right, pinnedIds),
  )
}
