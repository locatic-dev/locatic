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
