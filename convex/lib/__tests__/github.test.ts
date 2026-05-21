import { describe, expect, it } from 'vitest'

import {
  extractContributionCalendar,
  mapGithubLanguages,
  mapGithubRepositoryWithOptionalLanguages,
} from '../github'

describe('extractContributionCalendar', () => {
  it('returns null when GitHub responds without a user payload', () => {
    expect(extractContributionCalendar({ user: null })).toBeNull()
  })

  it('maps GitHub contribution weeks into the stored shape', () => {
    expect(
      extractContributionCalendar({
        user: {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 12,
              weeks: [
                {
                  contributionDays: [
                    { contributionCount: 3, date: '2026-05-01' },
                    { contributionCount: 0, date: '2026-05-02' },
                  ],
                },
              ],
            },
          },
        },
      }),
    ).toEqual({
      totalContributions: 12,
      weeks: [
        {
          days: [
            { count: 3, date: '2026-05-01' },
            { count: 0, date: '2026-05-02' },
          ],
        },
      ],
    })
  })
})

describe('mapGithubLanguages', () => {
  it('sorts repository languages by byte count and keeps the top three', () => {
    expect(
      mapGithubLanguages({
        CSS: 120,
        TypeScript: 900,
        HTML: 50,
        Rust: 300,
      }),
    ).toEqual([
      { name: 'TypeScript', bytes: 900 },
      { name: 'Rust', bytes: 300 },
      { name: 'CSS', bytes: 120 },
    ])
  })

  it('drops empty and zero-byte language entries', () => {
    expect(mapGithubLanguages({ '': 10, Go: 0, Python: 42 })).toEqual([
      { name: 'Python', bytes: 42 },
    ])
  })
})

describe('mapGithubRepositoryWithOptionalLanguages', () => {
  it('keeps importing a repository when the optional languages fetch fails', async () => {
    const repository = await mapGithubRepositoryWithOptionalLanguages({
      fetchRepository: async () => ({
        id: 1,
        full_name: 'avinash/locatic',
        name: 'locatic',
        description: 'Map-based discovery',
        html_url: 'https://github.com/avinash/locatic',
        homepage: 'https://locatic.dev',
        language: 'TypeScript',
        topics: ['maps', 'react'],
        stargazers_count: 42,
        pushed_at: '2026-05-20T00:00:00.000Z',
      }),
      fetchLanguages: async () => {
        throw new Error('GitHub languages unavailable')
      },
    })

    expect(repository.languages).toEqual([])
    expect(repository.fullName).toBe('avinash/locatic')
    expect(repository.primaryLanguage).toBe('TypeScript')
  })
})
