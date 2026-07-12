import { useEffect, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'

export const EXPLORE_SCOPE_VALUES = ['default', 'global', 'custom'] as const
export const EXPLORE_MODE_VALUES = ['builders', 'projects', 'posts'] as const

export type ExploreScope = (typeof EXPLORE_SCOPE_VALUES)[number]
export type ExploreMode = (typeof EXPLORE_MODE_VALUES)[number]

export type ExploreSearch = {
  mode: ExploreMode
  q: string
  scope: ExploreScope
  selectedCityIds: string[]
}

export type ExploreLoaderDeps = Pick<
  ExploreSearch,
  'mode' | 'scope' | 'selectedCityIds'
>

type ExplorePrefsLike = {
  exploreConfig: {
    cityIds: Array<string | Id<'cities'>>
  }
  cityId: string | Id<'cities'> | null
}

export type ExploreCityLike = {
  _id: string | Id<'cities'>
  displayName?: string
  normalizedName?: string
  slug?: string
}

export function getExploreCityIdentity(city: ExploreCityLike): string {
  return (
    city.slug?.trim().toLowerCase() ||
    city.normalizedName?.trim().toLowerCase() ||
    city.displayName?.trim().toLowerCase() ||
    String(city._id)
  )
}

export function dedupeExploreCityIds(cityIds: string[]): string[] {
  return Array.from(
    new Set(
      cityIds.filter(
        (cityId) => typeof cityId === 'string' && cityId.length > 0,
      ),
    ),
  )
}

export function dedupeExploreCities<TCity extends ExploreCityLike>(
  cities: TCity[],
): TCity[] {
  const seenIds = new Set<string>()
  const seenIdentities = new Set<string>()
  const result: TCity[] = []

  for (const city of cities) {
    const id = String(city._id)
    const identity = getExploreCityIdentity(city)

    if (seenIds.has(id) || seenIdentities.has(identity)) {
      continue
    }

    seenIds.add(id)
    seenIdentities.add(identity)
    result.push(city)
  }

  return result
}

export function dedupeExploreCityDocsForIds<TCity extends ExploreCityLike>(
  cityIds: string[],
  cities: TCity[],
): TCity[] {
  const cityById = new Map(cities.map((city) => [String(city._id), city]))
  return dedupeExploreCities(
    dedupeExploreCityIds(cityIds).flatMap((cityId) => {
      const city = cityById.get(cityId)
      return city ? [city] : []
    }),
  )
}

export function getCanonicalExploreCityIds<TCity extends ExploreCityLike>(
  cityIds: string[],
  cities: TCity[],
): string[] {
  const cityById = new Map(cities.map((city) => [String(city._id), city]))
  const seenIdentities = new Set<string>()
  const canonicalCityIds: string[] = []

  for (const cityId of dedupeExploreCityIds(cityIds)) {
    const city = cityById.get(cityId)
    if (!city) {
      canonicalCityIds.push(cityId)
      continue
    }

    const identity = getExploreCityIdentity(city)
    if (seenIdentities.has(identity)) {
      continue
    }

    seenIdentities.add(identity)
    canonicalCityIds.push(String(city._id))
  }

  return canonicalCityIds
}

export function areExploreCityIdsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((cityId, index) => cityId === right[index])
  )
}

export function removeExploreCityId<TCity extends ExploreCityLike>({
  cities,
  cityId,
  cityIds,
}: {
  cities: TCity[]
  cityId: string
  cityIds: string[]
}): string[] {
  const cityById = new Map(cities.map((city) => [String(city._id), city]))
  const targetCity = cityById.get(cityId)

  if (!targetCity) {
    return dedupeExploreCityIds(cityIds).filter(
      (selectedCityId) => selectedCityId !== cityId,
    )
  }

  const targetIdentity = getExploreCityIdentity(targetCity)
  return dedupeExploreCityIds(cityIds).filter((selectedCityId) => {
    const selectedCity = cityById.get(selectedCityId)
    return selectedCity
      ? getExploreCityIdentity(selectedCity) !== targetIdentity
      : selectedCityId !== cityId
  })
}

export function isExploreUserFollowed({
  followOverrides,
  followedUserIds,
  userId,
}: {
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  userId: string | Id<'users'>
}) {
  const userKey = String(userId)
  return followOverrides[userKey] ?? followedUserIds.has(userKey)
}

export function getNearbyBuilderCityIds({
  scope,
  selectedCityIds,
}: {
  scope: ExploreScope
  selectedCityIds: string[]
}) {
  return scope === 'global' ? [] : dedupeExploreCityIds(selectedCityIds)
}

export function getExploreResultSetKey({
  cityIds,
  mode,
  query,
  scope,
}: {
  cityIds: string[]
  mode: ExploreMode
  query: string
  scope: ExploreScope
}) {
  return JSON.stringify([mode, scope, cityIds, query])
}

export function getFreshExploreSearch(): ExploreSearch {
  return {
    mode: 'projects',
    q: '',
    scope: 'default',
    selectedCityIds: [],
  }
}

const EXPLORE_SEARCH_SESSION_STORAGE_KEY = 'locatic:explore-search:v1'
const EXPLORE_SEARCH_SESSION_EVENT = 'locatic:explore-search-session'

export function normalizeExploreSearch(
  search: Record<string, unknown>,
): ExploreSearch {
  const selectedCityIds = Array.isArray(search.selectedCityIds)
    ? dedupeExploreCityIds(
        search.selectedCityIds.filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0,
        ),
      )
    : []

  const rawScope = search.scope
  const scope =
    rawScope === 'global' || rawScope === 'custom' || rawScope === 'default'
      ? rawScope
      : 'default'
  const rawMode = search.mode
  const mode =
    rawMode === 'builders' || rawMode === 'projects' || rawMode === 'posts'
      ? rawMode
      : 'projects'
  const q = typeof search.q === 'string' ? search.q : ''

  return {
    mode,
    q,
    scope:
      scope === 'custom' && selectedCityIds.length === 0 ? 'global' : scope,
    selectedCityIds,
  }
}

function getExploreSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function readStoredExploreSearch(): ExploreSearch | null {
  const storage = getExploreSessionStorage()
  if (!storage) {
    return null
  }

  const storedSearch = storage.getItem(EXPLORE_SEARCH_SESSION_STORAGE_KEY)
  if (!storedSearch) {
    return null
  }

  try {
    const parsedSearch: unknown = JSON.parse(storedSearch)
    if (!parsedSearch || typeof parsedSearch !== 'object') {
      return null
    }

    return normalizeExploreSearch(parsedSearch as Record<string, unknown>)
  } catch {
    return null
  }
}

export function writeStoredExploreSearch(search: ExploreSearch): void {
  const storage = getExploreSessionStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(
      EXPLORE_SEARCH_SESSION_STORAGE_KEY,
      JSON.stringify(normalizeExploreSearch(search)),
    )
    window.dispatchEvent(new Event(EXPLORE_SEARCH_SESSION_EVENT))
  } catch {
    // Session restore is a convenience; storage failures should not block navigation.
  }
}

export function getResumeExploreSearch(): ExploreSearch {
  return readStoredExploreSearch() ?? getFreshExploreSearch()
}

function areExploreSearchesEqual(
  left: ExploreSearch,
  right: ExploreSearch,
): boolean {
  return (
    left.mode === right.mode &&
    left.q === right.q &&
    left.scope === right.scope &&
    areExploreCityIdsEqual(left.selectedCityIds, right.selectedCityIds)
  )
}

export function useResumeExploreSearch(refreshKey: string): ExploreSearch {
  const [resumeSearch, setResumeSearch] = useState(getFreshExploreSearch)

  useEffect(() => {
    const refreshResumeSearch = () => {
      const nextSearch = getResumeExploreSearch()
      setResumeSearch((currentSearch) =>
        areExploreSearchesEqual(currentSearch, nextSearch)
          ? currentSearch
          : nextSearch,
      )
    }

    refreshResumeSearch()
    window.addEventListener(EXPLORE_SEARCH_SESSION_EVENT, refreshResumeSearch)

    return () => {
      window.removeEventListener(
        EXPLORE_SEARCH_SESSION_EVENT,
        refreshResumeSearch,
      )
    }
  }, [refreshKey])

  return resumeSearch
}

export function getExploreLoaderDeps(
  search: Record<string, unknown>,
): ExploreLoaderDeps {
  const normalizedSearch = normalizeExploreSearch(search)
  return {
    mode: normalizedSearch.mode,
    scope: normalizedSearch.scope,
    selectedCityIds: normalizedSearch.selectedCityIds,
  }
}

export function deriveDefaultExploreCityIds(
  explorePrefs: ExplorePrefsLike | null | undefined,
): string[] {
  if (!explorePrefs) {
    return []
  }

  if (explorePrefs.exploreConfig.cityIds.length > 0) {
    return Array.from(
      new Set(
        explorePrefs.exploreConfig.cityIds.map((cityId) => String(cityId)),
      ),
    )
  }

  return explorePrefs.cityId ? [String(explorePrefs.cityId)] : []
}

export function getExploreProjectCityIds(
  search: Pick<ExploreSearch, 'scope' | 'selectedCityIds'>,
  defaultCityIds: string[],
): string[] {
  switch (search.scope) {
    case 'global':
      return []
    case 'custom':
      return search.selectedCityIds
    case 'default':
    default:
      return defaultCityIds
  }
}

export function getExploreScopeStatusCopy(
  scope: ExploreScope,
  mode: ExploreMode = 'projects',
  options: { isSearchActive?: boolean } = {},
) {
  switch (scope) {
    case 'custom':
      return 'strictly filtered to selected cities'
    case 'global':
      return mode === 'posts'
        ? options.isSearchActive
          ? 'searching posts everywhere'
          : 'showing posts everywhere'
        : `showing ${mode} everywhere`
    case 'default':
    default:
      return mode === 'posts'
        ? options.isSearchActive
          ? 'searching posts from your default city context'
          : 'showing posts from your default city context'
        : `showing ${mode} from your default city context`
  }
}

export function isExploreProjectFeedGlobal(scope: ExploreScope) {
  return scope === 'global'
}
