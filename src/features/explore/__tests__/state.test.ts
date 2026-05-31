import { describe, expect, it } from 'vitest'

import {
  areExploreCityIdsEqual,
  dedupeExploreCities,
  dedupeExploreCityIds,
  deriveDefaultExploreCityIds,
  getCanonicalExploreCityIds,
  getExploreProjectCityIds,
  getExploreScopeStatusCopy,
  getFreshExploreSearch,
  getNearbyBuilderCityIds,
  isExploreProjectFeedGlobal,
  isExploreUserFollowed,
  normalizeExploreSearch,
  removeExploreCityId,
} from '../state'

describe('explore state helpers', () => {
  it('defaults a fresh explore visit to default scope', () => {
    expect(getFreshExploreSearch()).toEqual({
      scope: 'default',
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
      selectedCityIds: [],
    })
  })

  it('dedupes city ids and semantically duplicate city records', () => {
    expect(dedupeExploreCityIds(['city_1', 'city_1', '', 'city_2'])).toEqual([
      'city_1',
      'city_2',
    ])

    const cities = dedupeExploreCities([
      {
        _id: 'city_bengaluru_1',
        displayName: 'Bengaluru, Karnataka, India',
        normalizedName: 'bengaluru, karnataka, india',
        slug: 'bengaluru-karnataka-in',
      },
      {
        _id: 'city_bengaluru_2',
        displayName: 'Bengaluru, Karnataka, India',
        normalizedName: 'bengaluru, karnataka, india',
        slug: 'bengaluru-karnataka-in',
      },
      {
        _id: 'city_hyderabad',
        displayName: 'Hyderabad, Telangana, India',
        normalizedName: 'hyderabad, telangana, india',
        slug: 'hyderabad-telangana-in',
      },
    ])

    expect(cities.map((city) => String(city._id))).toEqual([
      'city_bengaluru_1',
      'city_hyderabad',
    ])
  })

  it('canonicalizes selected city ids through loaded city docs', () => {
    expect(
      getCanonicalExploreCityIds(
        ['city_bengaluru_1', 'city_bengaluru_2', 'city_hyderabad'],
        [
          {
            _id: 'city_bengaluru_1',
            displayName: 'Bengaluru, Karnataka, India',
            normalizedName: 'bengaluru, karnataka, india',
          },
          {
            _id: 'city_bengaluru_2',
            displayName: 'Bengaluru, Karnataka, India',
            normalizedName: 'bengaluru, karnataka, india',
          },
          {
            _id: 'city_hyderabad',
            displayName: 'Hyderabad, Telangana, India',
            normalizedName: 'hyderabad, telangana, india',
          },
        ],
      ),
    ).toEqual(['city_bengaluru_1', 'city_hyderabad'])
  })

  it('detects changed canonical city id order for route updates', () => {
    expect(areExploreCityIdsEqual(['city_1'], ['city_1'])).toBe(true)
    expect(areExploreCityIdsEqual(['city_1'], ['city_2'])).toBe(false)
    expect(areExploreCityIdsEqual(['city_1'], ['city_1', 'city_2'])).toBe(false)
  })

  it('removes all semantic duplicates for a selected city chip', () => {
    expect(
      removeExploreCityId({
        cityId: 'city_bengaluru_1',
        cityIds: ['city_bengaluru_1', 'city_bengaluru_2', 'city_hyderabad'],
        cities: [
          {
            _id: 'city_bengaluru_1',
            displayName: 'Bengaluru, Karnataka, India',
            normalizedName: 'bengaluru, karnataka, india',
          },
          {
            _id: 'city_bengaluru_2',
            displayName: 'Bengaluru, Karnataka, India',
            normalizedName: 'bengaluru, karnataka, india',
          },
          {
            _id: 'city_hyderabad',
            displayName: 'Hyderabad, Telangana, India',
            normalizedName: 'hyderabad, telangana, india',
          },
        ],
      }),
    ).toEqual(['city_hyderabad'])
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
          selectedCityIds: [],
        },
        defaultCityIds,
      ),
    ).toEqual(['default_city'])

    expect(
      getExploreProjectCityIds(
        {
          scope: 'custom',
          selectedCityIds: ['custom_city'],
        },
        defaultCityIds,
      ),
    ).toEqual(['custom_city'])

    expect(
      getExploreProjectCityIds(
        {
          scope: 'global',
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

  it('uses active city ids for the nearby builders rail', () => {
    expect(
      getNearbyBuilderCityIds({
        scope: 'default',
        selectedCityIds: ['default_city'],
      }),
    ).toEqual(['default_city'])

    expect(
      getNearbyBuilderCityIds({
        scope: 'custom',
        selectedCityIds: ['custom_city', 'custom_city'],
      }),
    ).toEqual(['custom_city'])

    expect(
      getNearbyBuilderCityIds({
        scope: 'global',
        selectedCityIds: ['default_city'],
      }),
    ).toEqual([])
  })

  it('resolves follow state by owner user id instead of username', () => {
    const followedUserIds = new Set(['user_1'])

    expect(
      isExploreUserFollowed({
        followOverrides: {},
        followedUserIds,
        userId: 'user_1',
      }),
    ).toBe(true)

    expect(
      isExploreUserFollowed({
        followOverrides: {},
        followedUserIds,
        userId: 'github-handle',
      }),
    ).toBe(false)

    expect(
      isExploreUserFollowed({
        followOverrides: { user_1: false },
        followedUserIds,
        userId: 'user_1',
      }),
    ).toBe(false)
  })
})
