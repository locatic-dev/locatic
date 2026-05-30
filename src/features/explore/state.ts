import type { Id } from '../../../convex/_generated/dataModel'

export const EXPLORE_SCOPE_VALUES = ['default', 'global', 'custom'] as const

export type ExploreScope = (typeof EXPLORE_SCOPE_VALUES)[number]

export type ExploreSearch = {
  scope: ExploreScope
  selectedCityIds: string[]
}

type ExplorePrefsLike = {
  exploreConfig: {
    cityIds: Array<string | Id<'cities'>>
  }
  cityId: string | Id<'cities'> | null
}

export function getFreshExploreSearch(): ExploreSearch {
  return {
    scope: 'default',
    selectedCityIds: [],
  }
}

export function normalizeExploreSearch(
  search: Record<string, unknown>,
): ExploreSearch {
  const selectedCityIds = Array.isArray(search.selectedCityIds)
    ? Array.from(
        new Set(
          search.selectedCityIds.filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          ),
        ),
      )
    : []

  const rawScope = search.scope
  const scope =
    rawScope === 'global' || rawScope === 'custom' || rawScope === 'default'
      ? rawScope
      : 'default'

  return {
    scope:
      scope === 'custom' && selectedCityIds.length === 0 ? 'global' : scope,
    selectedCityIds,
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
  search: ExploreSearch,
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

export function getExploreScopeStatusCopy(scope: ExploreScope) {
  switch (scope) {
    case 'custom':
      return 'strictly filtered to selected cities'
    case 'global':
      return 'showing projects everywhere'
    case 'default':
    default:
      return 'showing projects from your default city context'
  }
}

export function isExploreProjectFeedGlobal(scope: ExploreScope) {
  return scope === 'global'
}
