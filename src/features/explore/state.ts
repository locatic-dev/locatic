import { useEffect, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { normalizeExploreLanguage } from '../../../convex/lib/explore'
import { normalizeProjectTopic } from '../../../convex/lib/topics'

export const EXPLORE_SCOPE_VALUES = ['default', 'global', 'custom'] as const
export const EXPLORE_MODE_VALUES = ['builders', 'projects', 'posts'] as const

export type ExploreScope = (typeof EXPLORE_SCOPE_VALUES)[number]
export type ExploreMode = (typeof EXPLORE_MODE_VALUES)[number]

/**
 * Explore URL state. `language` and `topic` filter the projects feed (plan
 * item D2) and `openToCollab` the builders feed (D3); each is present only
 * when set, so a plain Explore URL stays short.
 */
export type ExploreSearch = {
  mode: ExploreMode
  q: string
  scope: ExploreScope
  selectedCityIds: string[]
  language?: string
  topic?: string
  openToCollab?: true
}

/** Longest language or topic kept from the URL (topics cap at 50 on write). */
export const EXPLORE_FILTER_MAX_LENGTH = 50

/**
 * The language filter as the server compares it: the stack-preference
 * normalisation (trimmed, lower case). Blank or overlong input is no filter.
 */
export function normalizeExploreLanguageFilter(value: unknown) {
  if (typeof value !== 'string') return undefined
  const language = normalizeExploreLanguage(value)
  return language && language.length <= EXPLORE_FILTER_MAX_LENGTH
    ? language
    : undefined
}

/**
 * The topic filter in canonical topic form (`normalizeProjectTopic`, the
 * normalisation every stored topic went through), so the chip shows the
 * topic exactly as cards do.
 */
export function normalizeExploreTopicFilter(value: unknown) {
  if (typeof value !== 'string') return undefined
  const topic = normalizeProjectTopic(value)
  return topic && topic.length <= EXPLORE_FILTER_MAX_LENGTH ? topic : undefined
}

export type ExploreFilters = Pick<
  ExploreSearch,
  'language' | 'openToCollab' | 'topic'
>

/** The filters that apply to a mode: language and topic to projects, collab to builders. */
export function getExploreModeFilters(
  search: ExploreFilters,
  mode: ExploreMode,
): ExploreFilters {
  switch (mode) {
    case 'projects':
      return {
        ...(search.language ? { language: search.language } : {}),
        ...(search.topic ? { topic: search.topic } : {}),
      }
    case 'builders':
      return search.openToCollab ? { openToCollab: true } : {}
    case 'posts':
    default:
      return {}
  }
}

export type ExploreLoaderDeps = Pick<
  ExploreSearch,
  'mode' | 'scope' | 'selectedCityIds'
> & {
  /** The filters of the active mode, for the visitor feed's first page. */
  filters: ExploreFilters
}

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

/**
 * The selected city ids with duplicate cities collapsed. While the cities are
 * still loading an unknown id is kept; once they have loaded
 * (`dropUnresolved`), an id that resolved to no city is dropped instead of
 * showing as a city that never finishes loading.
 */
export function getCanonicalExploreCityIds<TCity extends ExploreCityLike>(
  cityIds: string[],
  cities: TCity[],
  { dropUnresolved = false }: { dropUnresolved?: boolean } = {},
): string[] {
  const cityById = new Map(cities.map((city) => [String(city._id), city]))
  const seenIdentities = new Set<string>()
  const canonicalCityIds: string[] = []

  for (const cityId of dedupeExploreCityIds(cityIds)) {
    const city = cityById.get(cityId)
    if (!city) {
      if (!dropUnresolved) {
        canonicalCityIds.push(cityId)
      }
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
  filters = {},
  mode,
  query,
  scope,
}: {
  cityIds: string[]
  filters?: ExploreFilters
  mode: ExploreMode
  query: string
  scope: ExploreScope
}) {
  return JSON.stringify([
    mode,
    scope,
    cityIds,
    query,
    filters.language ?? null,
    filters.topic ?? null,
    filters.openToCollab ?? false,
  ])
}

/**
 * What an unfiltered Explore URL normalizes to. The route strips these values
 * from every href, so `/explore` is its own canonical URL instead of
 * redirecting to a parameterized copy of itself.
 */
export const EXPLORE_SEARCH_DEFAULTS: Readonly<
  Pick<ExploreSearch, 'mode' | 'q' | 'scope' | 'selectedCityIds'>
> = {
  mode: 'projects',
  q: '',
  scope: 'default',
  selectedCityIds: [],
}

export function getFreshExploreSearch(): ExploreSearch {
  return { ...EXPLORE_SEARCH_DEFAULTS, selectedCityIds: [] }
}

/**
 * The text query Explore runs. Search needs a viewer (the search queries
 * return nothing without one) and visitors get no search box, so a visitor
 * opening a shared `?q=` link sees the browse feed; the query stays in the
 * URL and applies once they sign in.
 */
export function getExploreTextQuery(
  search: Pick<ExploreSearch, 'q'>,
  isVisitor: boolean,
): string {
  return isVisitor ? '' : search.q
}

/** Most cities a shared Explore URL may select. */
export const EXPLORE_MAX_SELECTED_CITIES = 10

// Convex document ids: Crockford base32 of the table number, a 16-byte id and
// a checksum, which comes to 31–37 lowercase letters and digits. Anything else
// in the URL cannot name a city and would fail the server's `v.id` check.
const CONVEX_ID_PATTERN = /^[a-z0-9]{20,40}$/

/** True when a URL value has the shape of a Convex document id. */
export function isConvexIdShape(value: unknown): value is string {
  return typeof value === 'string' && CONVEX_ID_PATTERN.test(value)
}

const EXPLORE_SEARCH_SESSION_STORAGE_KEY = 'locatic:explore-search:v1'
const EXPLORE_SEARCH_SESSION_EVENT = 'locatic:explore-search-session'

export function normalizeExploreSearch(
  search: Record<string, unknown>,
): ExploreSearch {
  const selectedCityIds = Array.isArray(search.selectedCityIds)
    ? dedupeExploreCityIds(
        search.selectedCityIds.filter(isConvexIdShape),
      ).slice(0, EXPLORE_MAX_SELECTED_CITIES)
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
  const language = normalizeExploreLanguageFilter(search.language)
  const topic = normalizeExploreTopicFilter(search.topic)

  return {
    mode,
    q,
    scope:
      scope === 'custom' && selectedCityIds.length === 0 ? 'global' : scope,
    selectedCityIds,
    // Every key is set, even when invalid: the router merges the raw URL
    // search under this result, so an omitted key would let a raw value in.
    language,
    topic,
    openToCollab: search.openToCollab === true ? true : undefined,
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
    left.language === right.language &&
    left.topic === right.topic &&
    left.openToCollab === right.openToCollab &&
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
    filters: getExploreModeFilters(normalizedSearch, normalizedSearch.mode),
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

/** Where an Explore view reads from: "everywhere", "bengaluru", "2 cities". */
export function getExploreScopeLabel(
  cities: Array<{ shortName: string | null }>,
) {
  const [onlyCity] = cities
  if (!onlyCity) return 'everywhere'
  if (cities.length === 1 && onlyCity.shortName) {
    return onlyCity.shortName.toLowerCase()
  }
  return `${cities.length} ${cities.length === 1 ? 'city' : 'cities'}`
}

/** Plain header status: "showing bengaluru", "searching everywhere". */
export function getExploreScopeStatusCopy({
  cities,
  isSearchActive = false,
}: {
  cities: Array<{ shortName: string | null }>
  isSearchActive?: boolean
}) {
  return `${isSearchActive ? 'searching' : 'showing'} ${getExploreScopeLabel(cities)}`
}

/**
 * Header eyebrow that says whose cities the view uses, so a global feed never
 * claims to be nearby.
 */
export function getExploreEyebrowCopy({
  cityCount,
  mode,
  scope,
}: {
  cityCount: number
  mode: ExploreMode
  scope: ExploreScope
}) {
  if (scope === 'global' || cityCount === 0) return `${mode} from everywhere`
  return scope === 'custom'
    ? `${mode} in cities you picked`
    : `${mode} near you`
}

/**
 * How a browse feed is ordered, in plain words (plan items D2, D4); no
 * percentages or "recommended" framing. Visitors have no stack preferences,
 * so their project feed claims only recency.
 */
export function getExploreOrderingCopy({
  isVisitor,
  mode,
}: {
  isVisitor: boolean
  mode: ExploreMode
}) {
  switch (mode) {
    case 'projects':
      return isVisitor
        ? 'most recent public work first'
        : 'most recent public work first; projects matching your stack first'
    case 'builders':
      return 'most recent public work first'
    case 'posts':
    default:
      return null
  }
}

/** Plain description of the active filters, for empty and partial states. */
export function describeExploreFilters(filters: ExploreFilters) {
  return [
    filters.language ? `primary language ${filters.language}` : null,
    filters.topic ? `topic #${filters.topic}` : null,
    filters.openToCollab ? 'open to collab' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ')
}

export function isExploreProjectFeedGlobal(scope: ExploreScope) {
  return scope === 'global'
}
