import { describe, expect, it } from 'vitest'

import {
  encodeRepositoryFullNamePath,
  extractContributionCalendar,
  listGithubRepositoryPages,
  mapGithubLanguages,
  mapGithubRepositoryWithOptionalLanguages,
  normalizeRepositoryFullNames,
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
        owner: {
          login: 'avinash',
        },
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
    expect(repository.ownerLogin).toBe('avinash')
    expect(repository.ownerLoginKey).toBe('avinash')
    expect(repository.nameKey).toBe('locatic')
    expect(repository.primaryLanguage).toBe('TypeScript')
  })
})

describe('normalizeRepositoryFullNames', () => {
  it('trims, dedupes case-insensitively, and preserves canonical names', () => {
    expect(
      normalizeRepositoryFullNames([
        ' avinash/locatic ',
        'Avinash/Locatic',
        'locatic-dev/locatic',
      ]),
    ).toEqual(['avinash/locatic', 'locatic-dev/locatic'])
  })

  it('rejects blank or malformed names before network calls', () => {
    expect(() => normalizeRepositoryFullNames([''])).toThrow(
      'Repository names must use owner/repo format',
    )
    expect(() => normalizeRepositoryFullNames(['owner/repo/extra'])).toThrow(
      'Repository names must use owner/repo format',
    )
  })

  it('rejects more than 25 unique repositories', () => {
    expect(() =>
      normalizeRepositoryFullNames(
        Array.from({ length: 26 }, (_, index) => `owner/repo-${index}`),
      ),
    ).toThrow('Select 25 or fewer repositories at a time')
  })
})

describe('encodeRepositoryFullNamePath', () => {
  it('encodes owner and repo path segments separately', () => {
    expect(encodeRepositoryFullNamePath('owner/repo.name')).toBe(
      'owner/repo.name',
    )
  })
})

describe('listGithubRepositoryPages', () => {
  it('accumulates pages and stops on a short page', async () => {
    const pages = await listGithubRepositoryPages({
      perPage: 3,
      fetchPage: async (page) =>
        page === 1 ? [1, 2, 3] : page === 2 ? [4] : [],
    })

    expect(pages).toEqual([1, 2, 3, 4])
  })

  it('stops at the configured page cap', async () => {
    const requestedPages: number[] = []

    const pages = await listGithubRepositoryPages({
      maxPages: 2,
      perPage: 2,
      fetchPage: async (page) => {
        requestedPages.push(page)
        return [`repo-${page}-a`, `repo-${page}-b`]
      },
    })

    expect(requestedPages).toEqual([1, 2])
    expect(pages).toEqual(['repo-1-a', 'repo-1-b', 'repo-2-a', 'repo-2-b'])
  })
})
