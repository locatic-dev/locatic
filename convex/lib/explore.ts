const RECENT_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export interface ExploreCandidate {
  id: string
  cityId: string
  primaryLanguage: string | null
  topics: string[]
  likesCount: number
  commentsCount: number
  stargazersCount: number
  lastCommitAt: number
  addedToLocaticAt: number
}

interface BuildExploreCandidatesOptions {
  candidates: ExploreCandidate[]
  ownedProjectIds: Set<string>
  dismissedProjectIds: Set<string>
  selectedCityIds: Set<string>
  stackPrefs: string[]
  now: number
  limit: number
}

export type NearbyBuilderRankCandidate = {
  github: {
    username: string
  }
  stats: {
    followersCount: number
    projectsCount: number
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

function computePopularityScore(candidate: ExploreCandidate): number {
  return (
    candidate.likesCount * 4 +
    candidate.commentsCount * 3 +
    candidate.stargazersCount
  )
}

function computeFreshnessScore(
  candidate: ExploreCandidate,
  now: number,
): number {
  const recencyBoost =
    now - candidate.lastCommitAt <= RECENT_ACTIVITY_WINDOW_MS ? 20 : 0

  return recencyBoost + candidate.commentsCount + candidate.likesCount
}

export function buildExploreCandidates({
  candidates,
  ownedProjectIds,
  dismissedProjectIds,
  selectedCityIds,
  stackPrefs,
  now,
  limit,
}: BuildExploreCandidatesOptions): ExploreCandidate[] {
  const filtered = candidates.filter((candidate) => {
    if (
      ownedProjectIds.has(candidate.id) ||
      dismissedProjectIds.has(candidate.id)
    ) {
      return false
    }

    return true
  })

  const pool =
    selectedCityIds.size > 0
      ? filtered.filter((candidate) => selectedCityIds.has(candidate.cityId))
      : filtered
  const stackPrefsSet = new Set(stackPrefs.map((pref) => pref.toLowerCase()))

  const enriched = pool.map((candidate) => {
    const stackBoost = candidate.primaryLanguage
      ? stackPrefsSet.has(candidate.primaryLanguage.toLowerCase())
        ? 10
        : 0
      : 0

    return {
      candidate,
      popularityScore: computePopularityScore(candidate) + stackBoost,
      freshnessScore: computeFreshnessScore(candidate, now) + stackBoost,
    }
  })

  const popularQuota = Math.max(1, Math.ceil(limit * 0.6))
  const freshQuota = Math.max(0, limit - popularQuota)

  const popular = [...enriched]
    .sort((left, right) => right.popularityScore - left.popularityScore)
    .slice(0, popularQuota)
    .map((entry) => entry.candidate)

  const usedIds = new Set(popular.map((candidate) => candidate.id))
  const fresh = enriched
    .filter((entry) => !usedIds.has(entry.candidate.id))
    .sort((left, right) => right.freshnessScore - left.freshnessScore)
    .slice(0, freshQuota)
    .map((entry) => entry.candidate)

  return [...popular, ...fresh].slice(0, limit)
}
