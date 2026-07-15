import { describe, expect, it } from 'vitest'

import {
  builderSearchQueryOptions,
  conversationRecipientPreviewQueryOptions,
  postSearchQueryOptions,
  privateFollowGraphQueryOptions,
  projectSearchQueryOptions,
  publicFollowGraphQueryOptions,
} from '../query-options'

describe('builderSearchQueryOptions', () => {
  it('passes active city filters through to builder search', () => {
    const query = builderSearchQueryOptions({
      cityIds: ['city_1' as never],
      q: 'react',
    })

    expect(query.queryKey[2]).toMatchObject({
      cityIds: ['city_1'],
      limit: 20,
      q: 'react',
    })
  })
})

describe('projectSearchQueryOptions', () => {
  it('targets project-only explore search args', () => {
    const query = projectSearchQueryOptions({
      cityIds: ['city_1' as never],
      q: 'convex',
    })

    expect(query.queryKey[2]).toMatchObject({
      cityIds: ['city_1'],
      limit: 10,
      q: 'convex',
    })
  })
})

describe('postSearchQueryOptions', () => {
  it('targets post-only explore search args', () => {
    const query = postSearchQueryOptions({
      cityIds: ['city_1' as never],
      q: '#react',
    })

    expect(query.queryKey[2]).toMatchObject({
      cityIds: ['city_1'],
      limit: 10,
      q: '#react',
    })
  })
})

describe('conversationRecipientPreviewQueryOptions', () => {
  it('keeps raw compose search params at the backend validation boundary', () => {
    const query = conversationRecipientPreviewQueryOptions('not-a-convex-id')

    expect(query.queryKey[2]).toMatchObject({
      otherUserId: 'not-a-convex-id',
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
