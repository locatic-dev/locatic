import { describe, expect, it } from 'vitest'

import {
  deriveDefaultExploreCityIds,
  getExploreProjectCityIds,
  getExploreScopeStatusCopy,
  getFreshExploreSearch,
  isExploreProjectFeedGlobal,
  normalizeExploreSearch,
} from '../state'

describe('explore state helpers', () => {
  it('defaults a fresh explore visit to default scope', () => {
    expect(getFreshExploreSearch()).toEqual({
      scope: 'default',
      builderQuery: '',
      cityQuery: '',
      selectedCityIds: [],
    })
  })

  it('normalizes route search params into a typed explore state', () => {
    expect(
      normalizeExploreSearch({
        scope: 'custom',
        builderQuery: '  avinash  ',
        cityQuery: 'banga',
        selectedCityIds: ['city_1', 'city_1', '', 123],
      }),
    ).toEqual({
      scope: 'custom',
      builderQuery: '  avinash  ',
      cityQuery: 'banga',
      selectedCityIds: ['city_1'],
    })
  })

  it('converts empty custom selections into an explicit global scope', () => {
    expect(
      normalizeExploreSearch({
        scope: 'custom',
        selectedCityIds: [],
      }),
    ).toEqual({
      scope: 'global',
      builderQuery: '',
      cityQuery: '',
      selectedCityIds: [],
    })
  })

  it('derives default city ids from saved explore config before profile city', () => {
    expect(
      deriveDefaultExploreCityIds({
        exploreConfig: {
          cityIds: ['city_1', 'city_2'],
        },
        cityId: 'city_profile',
      }),
    ).toEqual(['city_1', 'city_2'])
  })

  it('falls back to the profile city when no saved explore cities exist', () => {
    expect(
      deriveDefaultExploreCityIds({
        exploreConfig: {
          cityIds: [],
        },
        cityId: 'city_profile',
      }),
    ).toEqual(['city_profile'])
  })

  it('resolves project city ids from the active scope', () => {
    const defaultCityIds = ['default_city']

    expect(
      getExploreProjectCityIds(
        {
          scope: 'default',
          builderQuery: '',
          cityQuery: '',
          selectedCityIds: [],
        },
        defaultCityIds,
      ),
    ).toEqual(['default_city'])

    expect(
      getExploreProjectCityIds(
        {
          scope: 'custom',
          builderQuery: '',
          cityQuery: '',
          selectedCityIds: ['custom_city'],
        },
        defaultCityIds,
      ),
    ).toEqual(['custom_city'])

    expect(
      getExploreProjectCityIds(
        {
          scope: 'global',
          builderQuery: '',
          cityQuery: '',
          selectedCityIds: [],
        },
        defaultCityIds,
      ),
    ).toEqual([])
  })

  it('describes the active feed mode clearly', () => {
    expect(getExploreScopeStatusCopy('default')).toBe(
      'showing projects from your default city context',
    )
    expect(getExploreScopeStatusCopy('custom')).toBe(
      'strictly filtered to selected cities',
    )
    expect(getExploreScopeStatusCopy('global')).toBe(
      'showing projects everywhere',
    )
    expect(isExploreProjectFeedGlobal('default')).toBe(false)
    expect(isExploreProjectFeedGlobal('global')).toBe(true)
  })
})
