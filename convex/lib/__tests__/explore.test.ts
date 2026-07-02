import { describe, expect, test } from 'vitest'

import {
  getExploreCityIdsAfterProfileCityChange,
  rankNearbyBuilders,
} from '../explore'

describe('getExploreCityIdsAfterProfileCityChange', () => {
  test('sets the new profile city when explore defaults were empty', () => {
    expect(
      getExploreCityIdsAfterProfileCityChange({
        previousExploreCityIds: [],
        previousProfileCityId: 'hyderabad',
        nextProfileCityId: 'bengaluru',
      }),
    ).toEqual(['bengaluru'])
  })

  test('replaces the old profile city when explore defaults were profile-derived', () => {
    expect(
      getExploreCityIdsAfterProfileCityChange({
        previousExploreCityIds: ['hyderabad'],
        previousProfileCityId: 'hyderabad',
        nextProfileCityId: 'bengaluru',
      }),
    ).toEqual(['bengaluru'])
  })

  test('preserves explicit custom explore cities', () => {
    expect(
      getExploreCityIdsAfterProfileCityChange({
        previousExploreCityIds: ['mumbai', 'pune'],
        previousProfileCityId: 'hyderabad',
        nextProfileCityId: 'bengaluru',
      }),
    ).toEqual(['mumbai', 'pune'])
  })

  test('clears profile-derived explore defaults when profile city is removed', () => {
    expect(
      getExploreCityIdsAfterProfileCityChange({
        previousExploreCityIds: ['hyderabad'],
        previousProfileCityId: 'hyderabad',
        nextProfileCityId: null,
      }),
    ).toEqual([])
  })
})

describe('rankNearbyBuilders', () => {
  test('sorts by followers, projects, then username before applying the limit', () => {
    const result = rankNearbyBuilders(
      [
        {
          github: { username: 'zeta' },
          stats: { followersCount: 5, projectsCount: 2 },
        },
        {
          github: { username: 'alpha' },
          stats: { followersCount: 10, projectsCount: 1 },
        },
        {
          github: { username: 'beta' },
          stats: { followersCount: 10, projectsCount: 3 },
        },
        {
          github: { username: 'gamma' },
          stats: { followersCount: 10, projectsCount: 3 },
        },
      ],
      3,
    )

    expect(result.map((candidate) => candidate.github.username)).toEqual([
      'beta',
      'gamma',
      'alpha',
    ])
  })
})
