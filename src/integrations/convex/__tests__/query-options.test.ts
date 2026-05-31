import { describe, expect, it } from 'vitest'

import {
  exploreFeedQueryOptions,
  nearbyBuildersQueryOptions,
  privateFollowGraphQueryOptions,
  publicFollowGraphQueryOptions,
} from '../query-options'

describe('exploreFeedQueryOptions', () => {
  it('preserves the explicit explore scope in the query args', () => {
    const query = exploreFeedQueryOptions({
      scope: 'global',
      selectedCityIds: [],
    })

    expect(query.queryKey[2]).toMatchObject({
      scope: 'global',
      selectedCityIds: [],
    })
  })
})

describe('nearbyBuildersQueryOptions', () => {
  it('passes an explicit city id array so global scope cannot fall back', () => {
    const query = nearbyBuildersQueryOptions()

    expect(query.queryKey[2]).toMatchObject({
      cityIds: [],
    })
  })
})

describe('follow graph query options', () => {
  it('includes cursor-based pagination args for private follow graph queries', () => {
    const query = privateFollowGraphQueryOptions({
      kind: 'followers',
      paginationOpts: {
        cursor: null,
        numItems: 12,
      },
    })

    expect(query.queryKey[2]).toMatchObject({
      kind: 'followers',
      paginationOpts: {
        cursor: null,
        numItems: 12,
      },
    })
  })

  it('includes username and pagination args for public follow graph queries', () => {
    const query = publicFollowGraphQueryOptions({
      username: 'octocat',
      kind: 'following',
      paginationOpts: {
        cursor: 'cursor_1',
        numItems: 24,
      },
    })

    expect(query.queryKey[2]).toMatchObject({
      username: 'octocat',
      kind: 'following',
      paginationOpts: {
        cursor: 'cursor_1',
        numItems: 24,
      },
    })
  })
})
