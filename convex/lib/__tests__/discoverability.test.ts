import { describe, expect, test } from 'vitest'

import {
  buildDiscoverabilitySearchText,
  buildUserDiscoverabilitySearchText,
  isUserDiscoverableInExplore,
  matchesBuilderSearchQuery,
  mergeBuilderSearchCandidates,
} from '../discoverability'

describe('discoverability helpers', () => {
  test('buildDiscoverabilitySearchText normalizes and deduplicates parts', () => {
    expect(
      buildDiscoverabilitySearchText(' OctoCat ', 'Octo Cat', 'octocat'),
    ).toBe('octocat octo cat')
  })

  test('isUserDiscoverableInExplore hides deleted and deactivated users', () => {
    expect(
      isUserDiscoverableInExplore({
        appearInExplore: true,
        deletedAt: null,
        deactivatedAt: null,
      }),
    ).toBe(true)

    expect(
      isUserDiscoverableInExplore({
        appearInExplore: false,
        deletedAt: null,
        deactivatedAt: null,
      }),
    ).toBe(false)

    expect(
      isUserDiscoverableInExplore({
        appearInExplore: true,
        deletedAt: Date.now(),
        deactivatedAt: null,
      }),
    ).toBe(false)
  })

  test('mergeBuilderSearchCandidates keeps exact matches first without leaking hidden users', () => {
    const hiddenExact = {
      _id: 'hidden-user',
      appearInExplore: false,
      deletedAt: null,
      deactivatedAt: null,
      github: { username: 'octocat' },
      profile: {
        displayName: 'Octo Cat',
        fullName: 'Octo Cat',
        cityId: 'blr',
        avatarUrl: null,
      },
      stats: { followersCount: 1, projectsCount: 2 },
    }
    const visibleSearch = {
      _id: 'visible-user',
      appearInExplore: true,
      deletedAt: null,
      deactivatedAt: null,
      github: { username: 'octavia' },
      profile: {
        displayName: 'Octavia',
        fullName: 'Octavia',
        cityId: 'blr',
        avatarUrl: null,
      },
      stats: { followersCount: 3, projectsCount: 4 },
    }

    expect(
      mergeBuilderSearchCandidates({
        exactMatch: hiddenExact,
        searchResults: [visibleSearch],
        viewerId: 'viewer',
        cityIds: ['blr'],
        limit: 10,
      }).map((user) => user._id),
    ).toEqual(['visible-user'])
  })

  test('buildUserDiscoverabilitySearchText includes username and both name fields', () => {
    expect(
      buildUserDiscoverabilitySearchText({
        github: { username: 'bv-saketha-rama' },
        profile: {
          displayName: 'Saketha Rama',
          fullName: 'BV Saketha Rama',
        },
      }),
    ).toBe('bv-saketha-rama saketha rama bv saketha rama')
  })

  test('matchesBuilderSearchQuery supports tokenized full-name lookups', () => {
    expect(
      matchesBuilderSearchQuery(
        {
          github: { username: 'bv-saketha-rama' },
          profile: {
            displayName: 'Saketha Rama',
            fullName: 'BV Saketha Rama',
          },
        },
        'saketha rama',
      ),
    ).toBe(true)

    expect(
      matchesBuilderSearchQuery(
        {
          github: { username: 'bv-saketha-rama' },
          profile: {
            displayName: 'Saketha Rama',
            fullName: 'BV Saketha Rama',
          },
        },
        'octocat',
      ),
    ).toBe(false)
  })

  test('mergeBuilderSearchCandidates can include the viewer during explicit search', () => {
    const viewerMatch = {
      _id: 'viewer',
      appearInExplore: true,
      deletedAt: null,
      deactivatedAt: null,
      github: { username: 'octocat' },
      profile: {
        displayName: 'Octo Cat',
        fullName: 'Octo Cat',
        cityId: 'blr',
        avatarUrl: null,
      },
      stats: { followersCount: 1, projectsCount: 2 },
    }

    expect(
      mergeBuilderSearchCandidates({
        exactMatch: viewerMatch,
        searchResults: [],
        viewerId: 'viewer',
        cityIds: ['blr'],
        limit: 10,
        excludeViewerId: false,
      }).map((user) => user._id),
    ).toEqual(['viewer'])
  })
})
