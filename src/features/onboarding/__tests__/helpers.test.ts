import { describe, expect, it } from 'vitest'

import {
  buildPinnedProjectIds,
  deriveStackPrefsFromRepositories,
} from '../helpers'

describe('onboarding helpers', () => {
  it('derives a deduplicated stack preference list from repositories', () => {
    const stackPrefs = deriveStackPrefsFromRepositories([
      {
        fullName: 'locatic/web',
        primaryLanguage: 'TypeScript',
        topics: ['react', 'tanstack'],
      },
      {
        fullName: 'locatic/api',
        primaryLanguage: 'typescript',
        topics: ['Convex', 'react'],
      },
      {
        fullName: 'locatic/mobile',
        primaryLanguage: null,
        topics: ['ios'],
      },
    ])

    expect(stackPrefs).toEqual([
      'TypeScript',
      'react',
      'tanstack',
      'Convex',
      'ios',
    ])
  })

  it('maps pinned repo full names back to imported project ids in order', () => {
    const pinnedProjectIds = buildPinnedProjectIds(
      ['locatic/api', 'locatic/missing', 'locatic/web'],
      [
        {
          _id: 'project_web',
          github: { fullName: 'locatic/web' },
        },
        {
          _id: 'project_api',
          github: { fullName: 'locatic/api' },
        },
      ] as never,
    )

    expect(pinnedProjectIds).toEqual(['project_api', 'project_web'])
  })
})
