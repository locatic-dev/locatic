import { describe, expect, test } from 'vitest'

import { buildExploreCandidates, type ExploreCandidate } from '../explore'

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
  test('filters out seen and owned projects and keeps the requested limit', () => {
    const now = Date.now()
    const candidates = [
      createCandidate({ id: 'owned', likesCount: 100, lastCommitAt: now }),
      createCandidate({ id: 'seen', likesCount: 90, lastCommitAt: now }),
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
      seenProjectIds: new Set(['seen']),
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

  test('falls back to global candidates when the selected city pool is exhausted', () => {
    const now = Date.now()
    const result = buildExploreCandidates({
      candidates: [
        createCandidate({ id: 'city-a', cityId: 'city-a', likesCount: 15 }),
        createCandidate({ id: 'global', cityId: 'city-b', likesCount: 12 }),
      ],
      ownedProjectIds: new Set(),
      seenProjectIds: new Set(),
      selectedCityIds: new Set(['city-a']),
      stackPrefs: [],
      now,
      limit: 2,
    })

    expect(result.map((candidate) => candidate.id)).toEqual([
      'city-a',
      'global',
    ])
  })
})
