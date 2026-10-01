// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  COLLABORATION_BUILD_STATUSES,
  NEW_BUILDER_WINDOW_MS,
} from '../../../../convex/lib/explore'
import { NEW_BUILDER_WINDOW_MS as CLIENT_NEW_BUILDER_WINDOW_MS } from '@/lib/builder-activity'
import {
  BUILD_STATUS,
  isCollaborationStatus,
} from '@/components/ui/status-pill'

import {
  areExploreCityIdsEqual,
  dedupeExploreCities,
  dedupeExploreCityIds,
  deriveDefaultExploreCityIds,
  getCanonicalExploreCityIds,
  getExploreLoaderDeps,
  getExploreResultSetKey,
  getExploreProjectCityIds,
  getExploreEyebrowCopy,
  getExploreScopeStatusCopy,
  getFreshExploreSearch,
  getNearbyBuilderCityIds,
  getResumeExploreSearch,
  isExploreProjectFeedGlobal,
  isExploreUserFollowed,
  describeExploreFilters,
  getExploreModeFilters,
  getExploreOrderingCopy,
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
      selectedCityIds: [
        'k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q',
        'k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q',
      ],
    })

    expect(readStoredExploreSearch()).toEqual({
      mode: 'builders',
      q: 'react',
      scope: 'custom',
      selectedCityIds: ['k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q'],
    })
    expect(getResumeExploreSearch()).toEqual({
      mode: 'builders',
      q: 'react',
      scope: 'custom',
      selectedCityIds: ['k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q'],
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
      selectedCityIds: ['k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q'],
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
        selectedCityIds: ['k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q'],
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
        selectedCityIds: [
          'k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q',
          'k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q',
          '',
          123,
        ],
      }),
    ).toEqual({
      mode: 'builders',
      q: '  avinash  ',
      scope: 'custom',
      selectedCityIds: ['k57b3r9v6x2m1c0d8e4f5g6h7j8n9p0q'],
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

  it('serializes result-set identity without delimiter collisions', () => {
    expect(
      getExploreResultSetKey({
        mode: 'projects',
        scope: 'custom',
        cityIds: ['city_1', 'city_2'],
        query: 'react\u001fmap',
      }),
    ).toBe(
      '["projects","custom",["city_1","city_2"],"react\\u001fmap",null,null,false]',
    )
  })

  it('starts a new result set when a filter changes', () => {
    const base = {
      mode: 'projects' as const,
      scope: 'global' as const,
      cityIds: [],
      query: '',
    }

    expect(getExploreResultSetKey(base)).not.toBe(
      getExploreResultSetKey({ ...base, filters: { language: 'rust' } }),
    )
    expect(
      getExploreResultSetKey({ ...base, filters: { language: 'rust' } }),
    ).not.toBe(getExploreResultSetKey({ ...base, filters: { topic: 'rust' } }))
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

  it('names the scope in plain words', () => {
    const bengaluru = { shortName: 'Bengaluru' }
    const berlin = { shortName: 'Berlin' }

    expect(getExploreScopeStatusCopy({ cities: [bengaluru] })).toBe(
      'showing bengaluru',
    )
    expect(getExploreScopeStatusCopy({ cities: [] })).toBe('showing everywhere')
    expect(getExploreScopeStatusCopy({ cities: [bengaluru, berlin] })).toBe(
      'showing 2 cities',
    )
    expect(
      getExploreScopeStatusCopy({ cities: [], isSearchActive: true }),
    ).toBe('searching everywhere')
    // A city whose doc has not loaded yet is counted, never mislabelled.
    expect(getExploreScopeStatusCopy({ cities: [{ shortName: null }] })).toBe(
      'showing 1 city',
    )
  })

  it('keeps the eyebrow truthful about whose cities are shown', () => {
    expect(
      getExploreEyebrowCopy({
        cityCount: 1,
        mode: 'projects',
        scope: 'default',
      }),
    ).toBe('projects near you')
    expect(
      getExploreEyebrowCopy({
        cityCount: 2,
        mode: 'builders',
        scope: 'custom',
      }),
    ).toBe('builders in cities you picked')
    expect(
      getExploreEyebrowCopy({ cityCount: 0, mode: 'posts', scope: 'global' }),
    ).toBe('posts from everywhere')
    // A viewer with no default city browses everywhere, not "near you".
    expect(
      getExploreEyebrowCopy({
        cityCount: 0,
        mode: 'projects',
        scope: 'default',
      }),
    ).toBe('projects from everywhere')
  })

  it('treats only the global scope as the global project feed', () => {
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

describe('explore filters in the URL (D2, D3)', () => {
  it('keeps language and topic in the form the server compares', () => {
    expect(
      normalizeExploreSearch({
        mode: 'projects',
        language: '  TypeScript ',
        topic: 'AI/Agents',
        openToCollab: true,
      }),
    ).toEqual({
      mode: 'projects',
      q: '',
      scope: 'default',
      selectedCityIds: [],
      language: 'typescript',
      topic: 'ai-agents',
      openToCollab: true,
    })
  })

  it('drops blank, malformed and overlong filters from the URL', () => {
    const search = normalizeExploreSearch({
      language: '   ',
      topic: '!!!',
      openToCollab: 'yes',
    })

    // Present as undefined, so the router's search merge cannot bring the
    // raw URL value back.
    expect(search.language).toBeUndefined()
    expect(search.topic).toBeUndefined()
    expect(search.openToCollab).toBeUndefined()
    expect(
      normalizeExploreSearch({ language: 'x'.repeat(51) }).language,
    ).toBeUndefined()
    expect(normalizeExploreSearch({ language: 42 }).language).toBeUndefined()
  })

  it('round-trips filters through the stored member search', () => {
    writeStoredExploreSearch({
      mode: 'builders',
      q: '',
      scope: 'global',
      selectedCityIds: [],
      language: 'rust',
      openToCollab: true,
    })

    expect(readStoredExploreSearch()).toEqual({
      mode: 'builders',
      q: '',
      scope: 'global',
      selectedCityIds: [],
      language: 'rust',
      openToCollab: true,
    })
  })

  it('applies language and topic to projects and collab to builders only', () => {
    const search = {
      language: 'rust',
      topic: 'webgpu',
      openToCollab: true as const,
    }

    expect(getExploreModeFilters(search, 'projects')).toEqual({
      language: 'rust',
      topic: 'webgpu',
    })
    expect(getExploreModeFilters(search, 'builders')).toEqual({
      openToCollab: true,
    })
    expect(getExploreModeFilters(search, 'posts')).toEqual({})
    expect(describeExploreFilters({ language: 'rust', topic: 'webgpu' })).toBe(
      'primary language rust, topic #webgpu',
    )
  })

  it('describes feed order without recommendation framing', () => {
    expect(getExploreOrderingCopy({ isVisitor: false, mode: 'projects' })).toBe(
      'most recent public work first; projects matching your stack first',
    )
    // Visitors have no stack preferences to match.
    expect(getExploreOrderingCopy({ isVisitor: true, mode: 'projects' })).toBe(
      'most recent public work first',
    )
    expect(getExploreOrderingCopy({ isVisitor: true, mode: 'builders' })).toBe(
      'most recent public work first',
    )
    expect(getExploreOrderingCopy({ isVisitor: false, mode: 'posts' })).toBe(
      null,
    )
  })

  it('filters builders by the same statuses the pill treats as collaboration', () => {
    for (const status of Object.keys(BUILD_STATUS)) {
      expect(COLLABORATION_BUILD_STATUSES.has(status)).toBe(
        isCollaborationStatus(status),
      )
    }
  })

  it('uses the client new-builder window for the server label', () => {
    expect(NEW_BUILDER_WINDOW_MS).toBe(CLIENT_NEW_BUILDER_WINDOW_MS)
  })
})
