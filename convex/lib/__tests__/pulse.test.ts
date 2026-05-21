import { describe, expect, test } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import { buildPulseSnapshotRows, type PulseProjectInput } from '../pulse'

function createProject(
  partial: Partial<PulseProjectInput> & Pick<PulseProjectInput, 'projectId'>,
): PulseProjectInput {
  return {
    projectId: partial.projectId,
    projectSnapshot: partial.projectSnapshot ?? {
      name: partial.projectId,
      fullName: `owner/${partial.projectId}`,
      description: null,
      primaryLanguage: 'TypeScript',
      languages: [],
      likesCount: partial.likesCount ?? 0,
      commentsCount: partial.commentsCount ?? 0,
      stargazersCount: partial.stargazersCount ?? 0,
      ownerId: 'user-1' as Id<'users'>,
      ownerDisplayName: 'Owner',
      ownerAvatarUrl: 'https://example.com/avatar.png',
      cityId: 'city-1' as Id<'cities'>,
      cityName: 'Hyderabad',
    },
    likesCount: partial.likesCount ?? 0,
    commentsCount: partial.commentsCount ?? 0,
    stargazersCount: partial.stargazersCount ?? 0,
  }
}

describe('buildPulseSnapshotRows', () => {
  test('ranks projects by the selected metric and assigns sequential ranks', () => {
    const result = buildPulseSnapshotRows({
      scopeType: 'global',
      scopeId: null,
      timeWindow: 'week',
      sort: 'github_stars',
      projects: [
        createProject({ projectId: 'one', stargazersCount: 30 }),
        createProject({ projectId: 'two', stargazersCount: 80 }),
        createProject({ projectId: 'three', stargazersCount: 45 }),
      ],
      computedAt: 123,
    })

    expect(result.map((row) => [row.projectId, row.rank])).toEqual([
      ['two', 1],
      ['three', 2],
      ['one', 3],
    ])
  })
})
