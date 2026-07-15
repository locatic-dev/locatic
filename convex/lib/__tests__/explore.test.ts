import { describe, expect, test } from 'vitest'

import {
  collectVisibleExplorePage,
  getExploreCityIdsAfterProfileCityChange,
  isExplorePostInScope,
  isExploreProjectVisible,
  matchesExploreProjectStack,
  rankNearbyBuilders,
  rankExploreProjectsByStack,
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

describe('collectVisibleExplorePage', () => {
  test('fills a visible page across raw pages filtered by visibility', async () => {
    type TestItem = { id: string; visible: boolean }
    const batches = [
      {
        continueCursor: 'after-filtered',
        isDone: false,
        page: [
          { id: 'owned', visible: false },
          { id: 'dismissed', visible: false },
        ],
      },
      {
        continueCursor: 'after-visible',
        isDone: false,
        page: [
          { id: 'visible-1', visible: true },
          { id: 'visible-2', visible: true },
        ],
      },
    ]
    const seenCursors: Array<string | null> = []

    const result = await collectVisibleExplorePage<TestItem>({
      cursor: null,
      getVisibleItems: (items) => items.filter((item) => item.visible),
      loadBatch: async (cursor) => {
        seenCursors.push(cursor)
        return batches[seenCursors.length - 1] as (typeof batches)[number]
      },
      numItems: 2,
    })

    expect(result.page.map((item) => item.id)).toEqual([
      'visible-1',
      'visible-2',
    ])
    expect(result.continueCursor).toBe('after-visible')
    expect(result.isDone).toBe(false)
    expect(seenCursors).toEqual([null, 'after-filtered'])
  })

  test('keeps load-more honest when the loop cap hits only filtered rows', async () => {
    const result = await collectVisibleExplorePage({
      cursor: null,
      getVisibleItems: () => [],
      loadBatch: async (cursor) => ({
        continueCursor: cursor === null ? 'cursor-1' : `${cursor}-next`,
        isDone: false,
        page: [{ id: 'filtered' }],
      }),
      maxBatches: 2,
      numItems: 1,
    })

    expect(result.page).toEqual([])
    expect(result.continueCursor).toBe('cursor-1-next')
    expect(result.isDone).toBe(false)
  })
})

describe('explore visibility helpers', () => {
  test('filters owned, dismissed, and non-selected-city projects without applying stack prefs', () => {
    const selectedCityIdSet = new Set(['city-a', 'city-b'])

    expect(
      isExploreProjectVisible({
        dismissedProjectIds: new Set(),
        ownedProjectIds: new Set(['owned-project']),
        project: {
          _id: 'owned-project',
          exploreOwner: { cityId: 'city-a' },
        },
        selectedCityCount: 2,
        selectedCityIdSet,
      }),
    ).toBe(false)
    expect(
      isExploreProjectVisible({
        dismissedProjectIds: new Set(['dismissed-project']),
        ownedProjectIds: new Set(),
        project: {
          _id: 'dismissed-project',
          exploreOwner: { cityId: 'city-a' },
        },
        selectedCityCount: 2,
        selectedCityIdSet,
      }),
    ).toBe(false)
    expect(
      isExploreProjectVisible({
        dismissedProjectIds: new Set(),
        ownedProjectIds: new Set(),
        project: {
          _id: 'wrong-city-project',
          exploreOwner: { cityId: 'city-c' },
        },
        selectedCityCount: 2,
        selectedCityIdSet,
      }),
    ).toBe(false)
    expect(
      isExploreProjectVisible({
        dismissedProjectIds: new Set(),
        ownedProjectIds: new Set(),
        project: {
          _id: 'non-stack-project',
          exploreOwner: { cityId: 'city-a' },
        },
        selectedCityCount: 2,
        selectedCityIdSet,
      }),
    ).toBe(true)
  })

  test('filters dismissed and non-selected-city posts before async visibility checks', () => {
    const selectedCityIdSet = new Set(['city-a', 'city-b'])

    expect(
      isExplorePostInScope({
        dismissedPostIds: new Set(['dismissed-post']),
        post: { _id: 'dismissed-post', projectCityId: 'city-a' },
        selectedCityCount: 2,
        selectedCityIdSet,
      }),
    ).toBe(false)
    expect(
      isExplorePostInScope({
        dismissedPostIds: new Set(),
        post: { _id: 'wrong-city-post', projectCityId: 'city-c' },
        selectedCityCount: 2,
        selectedCityIdSet,
      }),
    ).toBe(false)
    expect(
      isExplorePostInScope({
        dismissedPostIds: new Set(),
        post: { _id: 'visible-post', projectCityId: 'city-a' },
        selectedCityCount: 2,
        selectedCityIdSet,
      }),
    ).toBe(true)
  })
})

describe('explore stack ranking', () => {
  test('matches languages and topics case-insensitively', () => {
    const stackPrefs = new Set(['typescript', 'convex'])

    expect(
      matchesExploreProjectStack(
        {
          github: {
            languages: [{ name: 'Rust' }],
            lastCommitAt: 1,
            primaryLanguage: 'TypeScript',
          },
        },
        stackPrefs,
      ),
    ).toBe(true)
    expect(
      matchesExploreProjectStack(
        {
          github: {
            languages: [{ name: 'Go' }],
            lastCommitAt: 1,
            primaryLanguage: 'Ruby',
          },
        },
        stackPrefs,
        ['Convex'],
      ),
    ).toBe(true)
  })

  test('boosts stack matches before sorting by last commit', () => {
    const projects = [
      {
        id: 'recent-non-match',
        github: {
          languages: [{ name: 'Go' }],
          lastCommitAt: 300,
          primaryLanguage: 'Go',
        },
      },
      {
        id: 'older-match',
        github: {
          languages: [{ name: 'TypeScript' }],
          lastCommitAt: 100,
          primaryLanguage: 'JavaScript',
        },
      },
      {
        id: 'oldest-non-match',
        github: {
          languages: [{ name: 'Ruby' }],
          lastCommitAt: 50,
          primaryLanguage: 'Ruby',
        },
      },
    ]

    expect(
      rankExploreProjectsByStack({
        getTopics: () => [],
        projects,
        stackPrefs: new Set(['typescript']),
      }).map((project) => project.id),
    ).toEqual(['older-match', 'recent-non-match', 'oldest-non-match'])
  })
})
