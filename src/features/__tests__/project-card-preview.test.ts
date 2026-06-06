import { describe, expect, it } from 'vitest'

import type { ProjectCardPreview } from '@/features/contracts'
import { getProjectCardRouteParams } from '@/features/project-card-preview'

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
