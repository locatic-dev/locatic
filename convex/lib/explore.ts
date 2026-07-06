export type NearbyBuilderRankCandidate = {
  github: {
    username: string
  }
  stats: {
    followersCount: number
    projectsCount: number
  }
}

export const EXPLORE_VISIBLE_PAGE_MAX_BATCHES = 5

type ExplorePageBatch<TItem> = {
  continueCursor: string
  isDone: boolean
  page: TItem[]
}

export type ExploreProjectStackCandidate = {
  github: {
    languages?: Array<{
      name: string
    }>
    lastCommitAt: number
    primaryLanguage: string | null
  }
}

type ExploreProjectVisibilityCandidate<TProjectId, TCityId> = {
  _id: TProjectId
  exploreOwner: {
    cityId: TCityId | null
  }
}

type ExplorePostScopeCandidate<TPostId, TCityId> = {
  _id: TPostId
  projectCityId: TCityId | null
}

type NearbyBuilderVisibilityCandidate<TUserId, TCityId> = {
  _id: TUserId
  profile: {
    cityId: TCityId | null
  }
}

export async function collectVisibleExplorePage<TItem>({
  cursor,
  getVisibleItems,
  loadBatch,
  maxBatches = EXPLORE_VISIBLE_PAGE_MAX_BATCHES,
  numItems,
}: {
  cursor: string | null
  getVisibleItems: (items: TItem[]) => TItem[] | Promise<TItem[]>
  loadBatch: (cursor: string | null) => Promise<ExplorePageBatch<TItem>>
  maxBatches?: number
  numItems: number
}) {
  const visiblePage: TItem[] = []
  let nextCursor = cursor
  let isDone = false
  let batchesRead = 0

  while (visiblePage.length < numItems && !isDone && batchesRead < maxBatches) {
    const batch = await loadBatch(nextCursor)
    visiblePage.push(...(await getVisibleItems(batch.page)))
    nextCursor = batch.continueCursor
    isDone = batch.isDone
    batchesRead += 1
  }

  return {
    continueCursor: nextCursor ?? '',
    isDone,
    page: visiblePage,
  }
}

export function getExploreCityIdsAfterProfileCityChange<TCityId>({
  nextProfileCityId,
  previousExploreCityIds,
  previousProfileCityId,
}: {
  nextProfileCityId: TCityId | null
  previousExploreCityIds: TCityId[]
  previousProfileCityId: TCityId | null
}): TCityId[] {
  const previousProfileCityKey =
    previousProfileCityId === null ? null : String(previousProfileCityId)
  const previousExploreCityKeys = previousExploreCityIds.map((cityId) =>
    String(cityId),
  )
  const wasProfileDerived =
    previousExploreCityKeys.length === 0 ||
    (previousExploreCityKeys.length === 1 &&
      previousProfileCityKey !== null &&
      previousExploreCityKeys[0] === previousProfileCityKey)

  if (!wasProfileDerived) {
    return previousExploreCityIds
  }

  return nextProfileCityId === null ? [] : [nextProfileCityId]
}

export function rankNearbyBuilders<
  TCandidate extends NearbyBuilderRankCandidate,
>(candidates: TCandidate[], limit = 8): TCandidate[] {
  return [...candidates]
    .sort((left, right) => {
      if (right.stats.followersCount !== left.stats.followersCount) {
        return right.stats.followersCount - left.stats.followersCount
      }

      if (right.stats.projectsCount !== left.stats.projectsCount) {
        return right.stats.projectsCount - left.stats.projectsCount
      }

      return left.github.username.localeCompare(right.github.username)
    })
    .slice(0, limit)
}

export function isExploreProjectVisible<TProjectId, TCityId>({
  dismissedProjectIds,
  ownedProjectIds,
  project,
  selectedCityIdSet,
  selectedCityCount,
}: {
  dismissedProjectIds: Set<string>
  ownedProjectIds: Set<string>
  project: ExploreProjectVisibilityCandidate<TProjectId, TCityId>
  selectedCityCount: number
  selectedCityIdSet: Set<string>
}) {
  const projectId = String(project._id)
  if (ownedProjectIds.has(projectId)) return false
  if (dismissedProjectIds.has(projectId)) return false

  return (
    selectedCityCount <= 1 ||
    (project.exploreOwner.cityId !== null &&
      selectedCityIdSet.has(String(project.exploreOwner.cityId)))
  )
}

export function isExplorePostInScope<TPostId, TCityId>({
  dismissedPostIds,
  post,
  selectedCityIdSet,
  selectedCityCount,
}: {
  dismissedPostIds: Set<string>
  post: ExplorePostScopeCandidate<TPostId, TCityId>
  selectedCityCount: number
  selectedCityIdSet: Set<string>
}) {
  if (dismissedPostIds.has(String(post._id))) return false

  return (
    selectedCityCount <= 1 ||
    (post.projectCityId !== null &&
      selectedCityIdSet.has(String(post.projectCityId)))
  )
}

export function isNearbyBuilderVisible<TUserId, TCityId>({
  selectedCityCount,
  selectedCityIdSet,
  user,
  viewerId,
}: {
  selectedCityCount: number
  selectedCityIdSet: Set<string>
  user: NearbyBuilderVisibilityCandidate<TUserId, TCityId>
  viewerId: TUserId
}) {
  if (String(user._id) === String(viewerId)) return false

  return (
    selectedCityCount <= 1 ||
    (user.profile.cityId !== null &&
      selectedCityIdSet.has(String(user.profile.cityId)))
  )
}

export function shouldReportPostSearchHasMore({
  candidateCount,
  candidateTake,
  limit,
  visibleCount,
}: {
  candidateCount: number
  candidateTake: number
  limit: number
  visibleCount: number
}) {
  return visibleCount > limit || candidateCount >= candidateTake
}

export function matchesExploreProjectStack(
  project: ExploreProjectStackCandidate,
  stackPrefs: Set<string>,
  topics: string[] = [],
) {
  if (stackPrefs.size === 0) return false

  const normalizedStackPrefs = new Set(
    [...stackPrefs].map((preference) => preference.toLowerCase()),
  )
  const languages = [
    project.github.primaryLanguage,
    ...(project.github.languages ?? []).map((language) => language.name),
  ].filter((language): language is string => Boolean(language))

  return [...languages, ...topics].some((value) =>
    normalizedStackPrefs.has(value.toLowerCase()),
  )
}

export function rankExploreProjectsByStack<
  TProject extends ExploreProjectStackCandidate,
>({
  getTopics,
  projects,
  stackPrefs,
}: {
  getTopics: (project: TProject) => string[]
  projects: TProject[]
  stackPrefs: Set<string>
}) {
  return [...projects].sort(
    (left, right) =>
      Number(matchesExploreProjectStack(right, stackPrefs, getTopics(right))) -
        Number(matchesExploreProjectStack(left, stackPrefs, getTopics(left))) ||
      right.github.lastCommitAt - left.github.lastCommitAt,
  )
}
