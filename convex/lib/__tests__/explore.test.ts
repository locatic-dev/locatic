import { describe, expect, test } from 'vitest'

import { getProjectTopics } from '../topics'

import {
  clampExplorePaginationOpts,
  EXPLORE_PAGE_MAX_ITEMS,
  filterExplorePage,
  getExploreCityIdsAfterProfileCityChange,
  isExplorePostInScope,
  isExploreProjectVisible,
  isOpenToCollaboration,
  matchesExploreProjectFilters,
  matchesExploreProjectStack,
  normalizeExploreProjectFilters,
  rankExploreProjectsByStack,
  selectViewerCityProjects,
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

describe('filterExplorePage', () => {
  test('filters one page and keeps its continuation untouched', async () => {
    const page = {
      continueCursor: 'after-page',
      isDone: false,
      page: [
        { id: 'owned', visible: false },
        { id: 'visible', visible: true },
      ],
      splitCursor: 'split',
      pageStatus: 'SplitRecommended' as const,
    }

    const result = await filterExplorePage(page, (items) =>
      items.filter((item) => item.visible).map((item) => item.id),
    )

    expect(result).toEqual({
      continueCursor: 'after-page',
      isDone: false,
      page: ['visible'],
      splitCursor: 'split',
      pageStatus: 'SplitRecommended',
    })
  })

  test('returns an empty page that is not done when every row is filtered', async () => {
    const result = await filterExplorePage(
      { continueCursor: 'cursor-1', isDone: false, page: [{ id: 'filtered' }] },
      async () => [],
    )

    expect(result).toEqual({
      continueCursor: 'cursor-1',
      isDone: false,
      page: [],
    })
  })
})

describe('explore visibility helpers', () => {
  test('filters owned, dismissed, and non-selected-city projects without applying stack prefs', () => {
    const selectedCityIdSet = new Set(['city-a', 'city-b'])
    const visible = (
      project: { _id: string; ownerId: string; cityId: string },
      overrides: {
        dismissedProjectIds?: Set<string>
        viewerId?: string | null
      } = {},
    ) =>
      isExploreProjectVisible({
        dismissedProjectIds: overrides.dismissedProjectIds ?? new Set(),
        project: {
          _id: project._id,
          ownerId: project.ownerId,
          exploreOwner: { cityId: project.cityId },
        },
        selectedCityCount: 2,
        selectedCityIdSet,
        viewerId:
          overrides.viewerId === undefined ? 'viewer' : overrides.viewerId,
      })

    expect(
      visible({ _id: 'owned-project', ownerId: 'viewer', cityId: 'city-a' }),
    ).toBe(false)
    expect(
      visible(
        { _id: 'dismissed-project', ownerId: 'other', cityId: 'city-a' },
        { dismissedProjectIds: new Set(['dismissed-project']) },
      ),
    ).toBe(false)
    expect(
      visible({
        _id: 'wrong-city-project',
        ownerId: 'other',
        cityId: 'city-c',
      }),
    ).toBe(false)
    expect(
      visible({ _id: 'non-stack-project', ownerId: 'other', cityId: 'city-a' }),
    ).toBe(true)
    // A visitor has no own projects to exclude.
    expect(
      visible(
        { _id: 'visitor-project', ownerId: 'viewer', cityId: 'city-a' },
        { viewerId: null },
      ),
    ).toBe(true)
  })

  test('appends own projects only at the end of an explicitly selected city feed', () => {
    const project = (
      id: string,
      cityId: string | null,
      lastCommitAt: number,
    ) => ({
      id,
      exploreOwner: { cityId, isEligible: true },
      github: { lastCommitAt },
    })
    const older = project('older', 'city-a', 1)
    const newer = project('newer', 'city-a', 2)
    const elsewhere = project('elsewhere', 'city-c', 3)
    const ineligible = {
      ...project('ineligible', 'city-a', 4),
      exploreOwner: { cityId: 'city-a', isEligible: false },
    }
    const projects = [older, newer, elsewhere, ineligible]
    const selectedCityIdSet = new Set(['city-a'])

    expect(
      selectViewerCityProjects({
        isDone: true,
        projects,
        scope: 'custom',
        selectedCityIdSet,
      }).map((row) => row.id),
    ).toEqual(['newer', 'older'])
    // Not yet on the last page, or not an explicit city choice: nothing.
    expect(
      selectViewerCityProjects({
        isDone: false,
        projects,
        scope: 'custom',
        selectedCityIdSet,
      }),
    ).toEqual([])
    for (const scope of ['default', 'global'] as const) {
      expect(
        selectViewerCityProjects({
          isDone: true,
          projects,
          scope,
          selectedCityIdSet,
        }),
      ).toEqual([])
    }
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

describe('explore project filters (D2)', () => {
  const project = (
    primaryLanguage: string | null,
    githubTopics: string[],
    tags: string[] = [],
  ) => ({
    github: {
      languages: [{ name: 'Shell' }],
      lastCommitAt: 1,
      primaryLanguage,
      topics: githubTopics,
    },
    locatic: { tags },
  })

  test('normalises filters like stack preferences and canonical topics', () => {
    expect(
      normalizeExploreProjectFilters({
        language: '  TypeScript ',
        topic: ' AI/Agents ',
      }),
    ).toEqual({ language: 'typescript', topic: 'ai-agents' })
    // Blank or punctuation-only values mean "any".
    expect(
      normalizeExploreProjectFilters({ language: '   ', topic: '!!!' }),
    ).toEqual({ language: null, topic: null })
    expect(normalizeExploreProjectFilters({})).toEqual({
      language: null,
      topic: null,
    })
  })

  test('matches the primary language only, case-insensitively', () => {
    const filters = normalizeExploreProjectFilters({ language: 'typescript' })

    expect(
      matchesExploreProjectFilters(
        project('TypeScript', []),
        filters,
        getProjectTopics,
      ),
    ).toBe(true)
    // A secondary language does not count as the primary language.
    expect(
      matchesExploreProjectFilters(
        {
          ...project('Go', []),
          github: {
            ...project('Go', []).github,
            languages: [{ name: 'TypeScript' }],
          },
        },
        filters,
        getProjectTopics,
      ),
    ).toBe(false)
    expect(
      matchesExploreProjectFilters(
        project(null, []),
        filters,
        getProjectTopics,
      ),
    ).toBe(false)
  })

  test('matches edited Locatic tags, not the GitHub topics they replace', () => {
    const edited = project('TypeScript', ['cli'], ['developer-tools', 'AI'])

    expect(
      matchesExploreProjectFilters(
        edited,
        normalizeExploreProjectFilters({ topic: 'ai' }),
        getProjectTopics,
      ),
    ).toBe(true)
    expect(
      matchesExploreProjectFilters(
        edited,
        normalizeExploreProjectFilters({ topic: 'cli' }),
        getProjectTopics,
      ),
    ).toBe(false)
    // Without edited tags the GitHub topics are canonical.
    expect(
      matchesExploreProjectFilters(
        project('TypeScript', ['cli']),
        normalizeExploreProjectFilters({ topic: 'CLI' }),
        getProjectTopics,
      ),
    ).toBe(true)
  })

  test('requires every set filter (AND)', () => {
    const filters = normalizeExploreProjectFilters({
      language: 'rust',
      topic: 'webgpu',
    })

    expect(
      matchesExploreProjectFilters(
        project('Rust', ['webgpu']),
        filters,
        getProjectTopics,
      ),
    ).toBe(true)
    expect(
      matchesExploreProjectFilters(
        project('Rust', ['graphics']),
        filters,
        getProjectTopics,
      ),
    ).toBe(false)
    expect(
      matchesExploreProjectFilters(
        project('TypeScript', ['webgpu']),
        filters,
        getProjectTopics,
      ),
    ).toBe(false)
  })
})

describe('collaboration intent (D3)', () => {
  test('keeps the statuses that invite someone in', () => {
    expect(
      [
        'open_to_collab',
        'looking_for_cofounder',
        'hiring',
        'building_solo',
        'just_exploring',
      ].filter(isOpenToCollaboration),
    ).toEqual(['open_to_collab', 'looking_for_cofounder', 'hiring'])
  })
})

describe('clampExplorePaginationOpts (S2)', () => {
  test('clamps numItems to 1..50 and keeps the cursor and other options', () => {
    expect(
      clampExplorePaginationOpts({ cursor: 'c1', numItems: 5000, id: 3 }),
    ).toEqual({ cursor: 'c1', numItems: EXPLORE_PAGE_MAX_ITEMS, id: 3 })
    expect(clampExplorePaginationOpts({ cursor: null, numItems: 12 })).toEqual({
      cursor: null,
      numItems: 12,
    })
    expect(
      clampExplorePaginationOpts({ cursor: null, numItems: 0 }).numItems,
    ).toBe(1)
    expect(
      clampExplorePaginationOpts({ cursor: null, numItems: 7.9 }).numItems,
    ).toBe(7)
    expect(
      clampExplorePaginationOpts({ cursor: null, numItems: Number.NaN })
        .numItems,
    ).toBe(EXPLORE_PAGE_MAX_ITEMS)
  })
})
