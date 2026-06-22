import { describe, expect, test } from 'vitest'

import {
  buildExploreCandidates,
  getExploreCityIdsAfterProfileCityChange,
  rankNearbyBuilders,
  selectExplorePostPage,
  type ExploreCandidate,
} from '../explore'

function createCandidate(
  partial: Partial<ExploreCandidate> & Pick<ExploreCandidate, 'id'>,
): ExploreCandidate {
  return {
    id: partial.id,
    cityId: partial.cityId ?? 'city-1',
    primaryLanguage: partial.primaryLanguage ?? 'TypeScript',
    topics: partial.topics ?? [],
    likesCount: partial.likesCount ?? 0,
    commentsCount: partial.commentsCount ?? 0,
    stargazersCount: partial.stargazersCount ?? 0,
    lastCommitAt: partial.lastCommitAt ?? Date.now(),
    addedToLocaticAt: partial.addedToLocaticAt ?? Date.now(),
  }
}

describe('buildExploreCandidates', () => {
  test('filters out dismissed and owned projects and keeps the requested limit', () => {
    const now = Date.now()
    const candidates = [
      createCandidate({ id: 'owned', likesCount: 100, lastCommitAt: now }),
      createCandidate({ id: 'dismissed', likesCount: 90, lastCommitAt: now }),
      createCandidate({ id: 'popular', likesCount: 80, lastCommitAt: now }),
      createCandidate({
        id: 'fresh',
        likesCount: 2,
        commentsCount: 1,
        lastCommitAt: now,
      }),
    ]

    const result = buildExploreCandidates({
      candidates,
      ownedProjectIds: new Set(['owned']),
      dismissedProjectIds: new Set(['dismissed']),
      selectedCityIds: new Set(['city-1']),
      stackPrefs: ['TypeScript'],
      now,
      limit: 2,
    })

    expect(result.map((candidate) => candidate.id)).toEqual([
      'popular',
      'fresh',
    ])
  })

  test('keeps city filtering strict when selected cities are present', () => {
    const now = Date.now()
    const result = buildExploreCandidates({
      candidates: [
        createCandidate({ id: 'city-a', cityId: 'city-a', likesCount: 15 }),
        createCandidate({ id: 'global', cityId: 'city-b', likesCount: 12 }),
      ],
      ownedProjectIds: new Set(),
      dismissedProjectIds: new Set(),
      selectedCityIds: new Set(['city-a']),
      stackPrefs: [],
      now,
      limit: 2,
    })

    expect(result.map((candidate) => candidate.id)).toEqual(['city-a'])
  })
})

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

describe('selectExplorePostPage', () => {
  test('returns newest non-dismissed posts up to the requested limit', () => {
    const result = selectExplorePostPage({
      dismissedPostIds: new Set(['dismissed']),
      limit: 2,
      posts: [
        { _id: 'old', createdAt: 100 },
        { _id: 'dismissed', createdAt: 400 },
        { _id: 'newest', createdAt: 500 },
        { _id: 'newer', createdAt: 300 },
      ],
    })

    expect(result.posts.map((post) => post._id)).toEqual(['newest', 'newer'])
  })

  test('sets hasMore when one extra visible post exists', () => {
    const result = selectExplorePostPage({
      dismissedPostIds: new Set(['dismissed']),
      limit: 2,
      posts: [
        { _id: 'first', createdAt: 500 },
        { _id: 'dismissed', createdAt: 400 },
        { _id: 'second', createdAt: 300 },
        { _id: 'third', createdAt: 100 },
      ],
    })

    expect(result.hasMore).toBe(true)
    expect(result.posts.map((post) => post._id)).toEqual(['first', 'second'])
  })

  test('clears hasMore when dismissed posts are the only extra rows', () => {
    const result = selectExplorePostPage({
      dismissedPostIds: new Set(['dismissed']),
      limit: 2,
      posts: [
        { _id: 'first', createdAt: 500 },
        { _id: 'dismissed', createdAt: 400 },
        { _id: 'second', createdAt: 300 },
      ],
    })

    expect(result.hasMore).toBe(false)
    expect(result.posts.map((post) => post._id)).toEqual(['first', 'second'])
  })
})
