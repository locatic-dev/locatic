import { describe, expect, it } from 'vitest'

import type { ProjectCardPreview } from '@/features/contracts'
import {
  getProjectCardRouteParams,
  toProjectCardData,
} from '@/features/project-card-preview'

describe('project card preview routing', () => {
  it('uses canonical route fields instead of splitting the display full name', () => {
    const preview = {
      fullName: 'legacy-owner/DisplayRepo',
      owner: 'CanonicalOwner',
      repo: 'DisplayRepo',
    } as ProjectCardPreview

    expect(getProjectCardRouteParams(preview)).toEqual({
      owner: 'CanonicalOwner',
      repo: 'DisplayRepo',
    })
  })
})

describe('toProjectCardData', () => {
  const basePreview = {
    projectId: 'project_1',
    ownerUserId: 'user_1',
    fullName: 'octo/app',
    owner: 'octo',
    repo: 'app',
    description: null,
    primaryLanguage: null,
    languages: [],
    githubStars: 0,
    locaticLikes: 0,
    commentsCount: 0,
    lastCommitAt: 1,
    updatedAt: 1,
    authorName: 'Octo',
    authorHandle: 'octo',
    authorAvatarUrl: null,
    cityLabel: 'Berlin',
    cityVisibilityState: 'exact_city',
  } as unknown as ProjectCardPreview

  it('links the city only for an exact-city owner and carries the card signals', () => {
    const card = toProjectCardData({
      ...basePreview,
      ownerLocation: {
        kind: 'city',
        cityId: 'city_berlin',
        cityName: 'Berlin',
        regionLabel: 'Germany',
      },
      ownerBuildStatus: 'open_to_collab',
      latestUpdate: { kind: 'release', at: 5, label: 'v1.0.0' },
      syncStatus: { kind: 'fresh', at: 4, hasReadme: true },
    } as unknown as ProjectCardPreview)

    expect(card.cityId).toBe('city_berlin')
    expect(card.buildStatus).toBe('open_to_collab')
    expect(card.latestUpdate).toEqual({
      kind: 'release',
      at: 5,
      label: 'v1.0.0',
    })
    expect(card.syncStatus).toEqual({ kind: 'fresh', at: 4, hasReadme: true })
  })

  it('never links a region-only or signal-less owner', () => {
    const region = toProjectCardData({
      ...basePreview,
      cityLabel: 'Germany',
      ownerLocation: { kind: 'region', regionLabel: 'Germany' },
    } as unknown as ProjectCardPreview)
    const legacy = toProjectCardData(basePreview)

    expect(region.city).toBe('Germany')
    expect(region.cityId).toBeNull()
    expect(legacy.cityId).toBeNull()
    expect(legacy.latestUpdate).toBeUndefined()
  })
})
