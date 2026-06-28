// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  areExploreCityIdsEqual,
  dedupeExploreCities,
  dedupeExploreCityIds,
  deriveDefaultExploreCityIds,
  getCanonicalExploreCityIds,
  getExploreLoaderDeps,
  getExploreProjectCityIds,
  getExploreScopeStatusCopy,
  getFreshExploreSearch,
  getNearbyBuilderCityIds,
  getResumeExploreSearch,
  isExploreProjectFeedGlobal,
  isExploreUserFollowed,
  normalizeExploreSearch,
  readStoredExploreSearch,
  removeExploreCityId,
  useResumeExploreSearch,
  writeStoredExploreSearch,
} from '../state'

function ResumeExploreSearchProbe({ refreshKey }: { refreshKey: string }) {
  const search = useResumeExploreSearch(refreshKey)

  return createElement(
    'output',
    { 'data-testid': 'resume-search' },
    JSON.stringify(search),
  )
}

function readResumeExploreSearchProbe() {
  return JSON.parse(screen.getByTestId('resume-search').textContent ?? '{}')
}

describe('explore state helpers', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('defaults a fresh explore visit to default scope', () => {
    expect(getFreshExploreSearch()).toEqual({
      mode: 'projects',
      q: '',
      scope: 'default',
      selectedCityIds: [],
    })
  })

  it('resumes fresh explore search when session storage is empty', () => {
    expect(getResumeExploreSearch()).toEqual(getFreshExploreSearch())
  })

  it('round-trips session explore search through normalization', () => {
    writeStoredExploreSearch({
      mode: 'builders',
      q: 'react',
      scope: 'custom',
      selectedCityIds: ['city_1', 'city_1'],
    })

    expect(readStoredExploreSearch()).toEqual({
      mode: 'builders',
      q: 'react',
      scope: 'custom',
      selectedCityIds: ['city_1'],
    })
    expect(getResumeExploreSearch()).toEqual({
      mode: 'builders',
      q: 'react',
      scope: 'custom',
      selectedCityIds: ['city_1'],
    })
  })

  it('falls back to fresh explore search when stored search is invalid', () => {
    writeStoredExploreSearch({
      mode: 'posts',
      q: 'convex',
      scope: 'global',
      selectedCityIds: [],
    })

    const storageKey = window.sessionStorage.key(0)
    expect(storageKey).toBeTruthy()
    window.sessionStorage.setItem(storageKey as string, '{invalid json')

    expect(readStoredExploreSearch()).toBeNull()
    expect(getResumeExploreSearch()).toEqual(getFreshExploreSearch())
  })

  it('normalizes empty custom session selections to global scope', () => {
    writeStoredExploreSearch({
      mode: 'projects',
      q: '',
      scope: 'custom',
      selectedCityIds: [],
    })

    expect(readStoredExploreSearch()).toEqual({
      mode: 'projects',
      q: '',
      scope: 'global',
      selectedCityIds: [],
    })
  })

  it('server-renders fresh search and hydrates resumed search after mount', async () => {
    writeStoredExploreSearch({
      mode: 'builders',
      q: 'react',
      scope: 'custom',
      selectedCityIds: ['city_1'],
    })

    expect(
      renderToString(
        createElement(ResumeExploreSearchProbe, { refreshKey: '/home' }),
      ),
    ).toContain('&quot;mode&quot;:&quot;projects&quot;')

    const { rerender } = render(
      createElement(ResumeExploreSearchProbe, { refreshKey: '/home' }),
    )

    await waitFor(() => {
      expect(readResumeExploreSearchProbe()).toEqual({
        mode: 'builders',
        q: 'react',
        scope: 'custom',
        selectedCityIds: ['city_1'],
      })
    })

    const storageKey = window.sessionStorage.key(0)
    expect(storageKey).toBeTruthy()
    window.sessionStorage.setItem(
      storageKey as string,
      JSON.stringify({
        mode: 'posts',
        q: 'convex',
        scope: 'global',
        selectedCityIds: [],
      }),
    )

    rerender(
      createElement(ResumeExploreSearchProbe, { refreshKey: '/explore' }),
    )

    await waitFor(() => {
      expect(readResumeExploreSearchProbe()).toEqual({
        mode: 'posts',
        q: 'convex',
        scope: 'global',
        selectedCityIds: [],
      })
    })
  })

  it('normalizes route search params into a typed explore state', () => {
    expect(
      normalizeExploreSearch({
        mode: 'builders',
        q: '  avinash  ',
        scope: 'custom',
        selectedCityIds: ['city_1', 'city_1', '', 123],
      }),
    ).toEqual({
      mode: 'builders',
      q: '  avinash  ',
      scope: 'custom',
      selectedCityIds: ['city_1'],
    })
  })

  it('accepts posts as a first-class explore mode', () => {
    expect(
      normalizeExploreSearch({
        mode: 'posts',
        q: '#react',
        scope: 'global',
      }),
    ).toEqual({
      mode: 'posts',
      q: '#react',
      scope: 'global',
      selectedCityIds: [],
    })
  })

  it('keeps loader deps stable across query-only changes', () => {
    expect(
      getExploreLoaderDeps({
        mode: 'posts',
        q: 'react',
        scope: 'custom',
        selectedCityIds: ['city_1'],
      }),
    ).toEqual(
      getExploreLoaderDeps({
        mode: 'posts',
        q: 'maps',
        scope: 'custom',
        selectedCityIds: ['city_1'],
      }),
    )
  })

  it('converts empty custom selections into an explicit global scope', () => {
    expect(
      normalizeExploreSearch({
        scope: 'custom',
        selectedCityIds: [],
      }),
    ).toEqual({
      mode: 'projects',
      q: '',
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
    expect(getExploreScopeStatusCopy('default', 'builders')).toBe(
      'showing builders from your default city context',
    )
    expect(getExploreScopeStatusCopy('default', 'posts')).toBe(
      'showing posts from your default city context',
    )
    expect(
      getExploreScopeStatusCopy('default', 'posts', { isSearchActive: true }),
    ).toBe('searching posts from your default city context')
    expect(getExploreScopeStatusCopy('custom')).toBe(
      'strictly filtered to selected cities',
    )
    expect(getExploreScopeStatusCopy('global')).toBe(
      'showing projects everywhere',
    )
    expect(getExploreScopeStatusCopy('global', 'builders')).toBe(
      'showing builders everywhere',
    )
    expect(getExploreScopeStatusCopy('global', 'posts')).toBe(
      'showing posts everywhere',
    )
    expect(
      getExploreScopeStatusCopy('global', 'posts', { isSearchActive: true }),
    ).toBe('searching posts everywhere')
    expect(isExploreProjectFeedGlobal('default')).toBe(false)
    expect(isExploreProjectFeedGlobal('global')).toBe(true)
  })

  it('uses active city ids for the builders tab directory', () => {
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
