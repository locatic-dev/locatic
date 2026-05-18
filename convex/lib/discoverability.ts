type SearchTextPart = string | null | undefined

interface DiscoverabilityIdentity {
  github: {
    username: string
  }
  profile: {
    displayName: string
    fullName?: string | null
    cityId?: string | null
    avatarUrl?: string | null
  }
  stats: {
    followersCount: number
    projectsCount: number
  }
  appearInExplore: boolean
  deletedAt?: number | null
  deactivatedAt?: number | null
  _id: unknown
}

export function buildDiscoverabilitySearchText(
  ...parts: SearchTextPart[]
): string {
  const normalized = parts
    .map((part) => part?.trim().toLowerCase())
    .filter((part): part is string => Boolean(part))

  return [...new Set(normalized)].join(' ')
}

export function buildUserDiscoverabilitySearchText(
  user: Pick<DiscoverabilityIdentity, 'github' | 'profile'>,
) {
  return buildDiscoverabilitySearchText(
    user.github.username,
    user.profile.displayName,
    user.profile.fullName ?? user.profile.displayName,
  )
}

export function isUserDiscoverableInExplore(user: {
  appearInExplore: boolean
  deletedAt?: number | null
  deactivatedAt?: number | null
}) {
  return user.appearInExplore && !user.deletedAt && !user.deactivatedAt
}

function matchesBuilderCityFilter(
  user: DiscoverabilityIdentity,
  cityIds: ReadonlySet<string>,
) {
  if (cityIds.size === 0) {
    return true
  }

  return user.profile.cityId ? cityIds.has(String(user.profile.cityId)) : false
}

export function matchesBuilderSearchQuery(
  user: Pick<DiscoverabilityIdentity, 'github' | 'profile'>,
  normalizedQuery: string,
) {
  const haystack = buildUserDiscoverabilitySearchText(user)
  if (!haystack) {
    return false
  }

  const tokens = normalizedQuery
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return false
  }

  return tokens.every((token) => haystack.includes(token))
}

export function mergeBuilderSearchCandidates<
  T extends DiscoverabilityIdentity,
>({
  exactMatch,
  searchResults,
  viewerId,
  cityIds,
  limit,
  excludeViewerId = true,
}: {
  exactMatch: T | null
  searchResults: T[]
  viewerId: unknown
  cityIds: readonly string[]
  limit: number
  excludeViewerId?: boolean
}) {
  const selectedCityIds = new Set(cityIds)
  const seen = new Set<string>()
  const merged: T[] = []

  const candidates = exactMatch ? [exactMatch, ...searchResults] : searchResults

  for (const candidate of candidates) {
    const candidateId = String(candidate._id)
    if (excludeViewerId && candidateId === String(viewerId)) {
      continue
    }
    if (seen.has(candidateId)) {
      continue
    }
    if (!isUserDiscoverableInExplore(candidate)) {
      continue
    }
    if (!matchesBuilderCityFilter(candidate, selectedCityIds)) {
      continue
    }

    seen.add(candidateId)
    merged.push(candidate)

    if (merged.length >= limit) {
      break
    }
  }

  return merged
}

export function mapBuilderSearchResult(user: DiscoverabilityIdentity) {
  return {
    userId: user._id,
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl ?? null,
    githubUsername: user.github.username,
    projectsCount: user.stats.projectsCount,
    followersCount: user.stats.followersCount,
  }
}
