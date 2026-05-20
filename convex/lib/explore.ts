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
