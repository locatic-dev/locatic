import { describe, expect, it } from 'vitest'

import {
  assertGithubRawDownloadUrl,
  CONTRIBUTOR_SYNC_RETRY_INTERVAL_MS,
  encodeRepositoryFullNamePath,
  deriveGithubReadmeUrlBases,
  extractContributionCalendar,
  isProjectContributorSyncDue,
  listGithubRepositoryPages,
  mapGithubContributorsForImport,
  mapGithubLanguages,
  mapGithubRepositoryWithOptionalLanguages,
  needsGithubReadmeUrlBaseKeyNormalization,
  normalizeLegacyGithubReadmeUrlBaseKeys,
  normalizeGithubReadmePreview,
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
    expect(repository.readmePreview).toBeNull()
    expect(repository.fullName).toBe('avinash/locatic')
    expect(repository.ownerLogin).toBe('avinash')
    expect(repository.ownerLoginKey).toBe('avinash')
    expect(repository.nameKey).toBe('locatic')
    expect(repository.primaryLanguage).toBe('TypeScript')
  })

  it('stores fetched README markdown instead of duplicating the description', async () => {
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
      fetchLanguages: async () => ({ TypeScript: 900 }),
      fetchReadme: async () => ({
        markdown: '# Locatic\n\nGitHub with a map.',
        metadata: {
          download_url:
            'https://raw.githubusercontent.com/avinash/locatic/main/README.md',
          html_url: 'https://github.com/avinash/locatic/blob/main/README.md',
          path: 'README.md',
        },
      }),
    })

    expect(repository.readmePreview).toBe('# Locatic\n\nGitHub with a map.')
    expect(repository.readmePreview).not.toBe(repository.description)
    expect(repository.readmeAssetBaseUrl).toBe(
      'https://raw.githubusercontent.com/avinash/locatic/main/',
    )
    expect(repository.readmeAssetRootUrl).toBe(
      'https://raw.githubusercontent.com/avinash/locatic/main/',
    )
    expect(repository.readmeLinkBaseUrl).toBe(
      'https://github.com/avinash/locatic/blob/main/',
    )
    expect(repository.readmeLinkRootUrl).toBe(
      'https://github.com/avinash/locatic/blob/main/',
    )
  })

  it('keeps importing a repository when the optional README fetch fails', async () => {
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
      fetchLanguages: async () => ({ TypeScript: 900 }),
      fetchReadme: async () => {
        throw new Error('GitHub README unavailable')
      },
    })

    expect(repository.languages).toEqual([{ bytes: 900, name: 'TypeScript' }])
    expect(repository.readmePreview).toBeNull()
    expect(repository.readmeAssetBaseUrl).toBeNull()
    expect(repository.readmeAssetRootUrl).toBeNull()
    expect(repository.readmeLinkBaseUrl).toBeNull()
    expect(repository.readmeLinkRootUrl).toBeNull()
  })
})

describe('deriveGithubReadmeUrlBases', () => {
  it('derives raw and GitHub web bases for a repository-root README', () => {
    expect(
      deriveGithubReadmeUrlBases({
        download_url:
          'https://raw.githubusercontent.com/octokit/octokit.rb/master/README.md',
        html_url: 'https://github.com/octokit/octokit.rb/blob/master/README.md',
        path: 'README.md',
      }),
    ).toEqual({
      readmeAssetBaseUrl:
        'https://raw.githubusercontent.com/octokit/octokit.rb/master/',
      readmeAssetRootUrl:
        'https://raw.githubusercontent.com/octokit/octokit.rb/master/',
      readmeLinkBaseUrl: 'https://github.com/octokit/octokit.rb/blob/master/',
      readmeLinkRootUrl: 'https://github.com/octokit/octokit.rb/blob/master/',
    })
  })

  it('derives directory and root bases for a nested README', () => {
    expect(
      deriveGithubReadmeUrlBases({
        download_url:
          'https://raw.githubusercontent.com/owner/repo/main/docs/setup/README.md',
        html_url:
          'https://github.com/owner/repo/blob/main/docs/setup/README.md',
        path: 'docs/setup/README.md',
      }),
    ).toEqual({
      readmeAssetBaseUrl:
        'https://raw.githubusercontent.com/owner/repo/main/docs/setup/',
      readmeAssetRootUrl: 'https://raw.githubusercontent.com/owner/repo/main/',
      readmeLinkBaseUrl: 'https://github.com/owner/repo/blob/main/docs/setup/',
      readmeLinkRootUrl: 'https://github.com/owner/repo/blob/main/',
    })
  })

  it('derives bases when the branch and README path contain encoded segments', () => {
    expect(
      deriveGithubReadmeUrlBases({
        download_url:
          'https://raw.githubusercontent.com/owner/repo/feature%2Fdocs/docs/My%20README.md',
        html_url:
          'https://github.com/owner/repo/blob/feature%2Fdocs/docs/My%20README.md',
        path: 'docs/My README.md',
      }),
    ).toEqual({
      readmeAssetBaseUrl:
        'https://raw.githubusercontent.com/owner/repo/feature%2Fdocs/docs/',
      readmeAssetRootUrl:
        'https://raw.githubusercontent.com/owner/repo/feature%2Fdocs/',
      readmeLinkBaseUrl:
        'https://github.com/owner/repo/blob/feature%2Fdocs/docs/',
      readmeLinkRootUrl: 'https://github.com/owner/repo/blob/feature%2Fdocs/',
    })
  })

  it('returns null bases for missing or incomplete metadata', () => {
    expect(deriveGithubReadmeUrlBases(null)).toEqual({
      readmeAssetBaseUrl: null,
      readmeAssetRootUrl: null,
      readmeLinkBaseUrl: null,
      readmeLinkRootUrl: null,
    })
    expect(
      deriveGithubReadmeUrlBases({
        download_url: null,
        html_url: 'https://github.com/owner/repo/blob/main/README.md',
        path: 'README.md',
      }),
    ).toEqual({
      readmeAssetBaseUrl: null,
      readmeAssetRootUrl: null,
      readmeLinkBaseUrl: null,
      readmeLinkRootUrl: null,
    })
  })
})

describe('legacy GitHub README URL base normalization', () => {
  it('detects missing README URL-base keys', () => {
    expect(
      needsGithubReadmeUrlBaseKeyNormalization({
        readmeAssetBaseUrl: 'https://raw.githubusercontent.com/o/r/main/',
        readmeAssetRootUrl: 'https://raw.githubusercontent.com/o/r/main/',
        readmeLinkBaseUrl: 'https://github.com/o/r/blob/main/',
      }),
    ).toBe(true)

    expect(
      needsGithubReadmeUrlBaseKeyNormalization({
        readmeAssetBaseUrl: null,
        readmeAssetRootUrl: null,
        readmeLinkBaseUrl: null,
        readmeLinkRootUrl: null,
      }),
    ).toBe(false)
  })

  it('normalizes legacy README URL-base keys to required nullable values', () => {
    expect(
      normalizeLegacyGithubReadmeUrlBaseKeys({
        readmeAssetBaseUrl: 'https://raw.githubusercontent.com/o/r/main/',
        readmeAssetRootUrl: undefined,
        readmeLinkBaseUrl: 42,
        readmeLinkRootUrl: null,
      }),
    ).toEqual({
      readmeAssetBaseUrl: 'https://raw.githubusercontent.com/o/r/main/',
      readmeAssetRootUrl: null,
      readmeLinkBaseUrl: null,
      readmeLinkRootUrl: null,
    })
  })
})

describe('assertGithubRawDownloadUrl', () => {
  it('allows HTTPS raw.githubusercontent.com README URLs', () => {
    expect(
      assertGithubRawDownloadUrl(
        'https://raw.githubusercontent.com/owner/repo/main/README.md',
      ),
    ).toBe('https://raw.githubusercontent.com/owner/repo/main/README.md')
  })

  it('strips credentials before returning an allowed raw URL', () => {
    expect(
      assertGithubRawDownloadUrl(
        'https://user:token@raw.githubusercontent.com/owner/repo/main/README.md',
      ),
    ).toBe('https://raw.githubusercontent.com/owner/repo/main/README.md')
  })

  it('rejects non-raw GitHub and non-HTTPS URLs', () => {
    expect(() =>
      assertGithubRawDownloadUrl(
        'https://github.com/owner/repo/raw/main/README.md',
      ),
    ).toThrow('GitHub README download URL host is not allowed')
    expect(() =>
      assertGithubRawDownloadUrl(
        'http://raw.githubusercontent.com/owner/repo/main/README.md',
      ),
    ).toThrow('GitHub README download URL host is not allowed')
  })
})

describe('normalizeGithubReadmePreview', () => {
  it('trims blank README content and stores null', () => {
    expect(normalizeGithubReadmePreview('   \n\t  ')).toBeNull()
  })

  it('caps README content before storage', () => {
    const preview = normalizeGithubReadmePreview('a'.repeat(20_010))

    expect(preview).toHaveLength(20_005)
    expect(preview?.endsWith('\n\n...')).toBe(true)
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

describe('mapGithubContributorsForImport', () => {
  it('maps stable GitHub user ids and contribution counts', () => {
    expect(
      mapGithubContributorsForImport([
        {
          id: 123,
          login: 'avinash',
          contributions: 42,
          type: 'User',
        },
      ]),
    ).toEqual([
      {
        githubId: 123,
        githubUsername: 'avinash',
        commitCount: 42,
      },
    ])
  })

  it('filters anonymous and bot contributors before matching Locatic users', () => {
    expect(
      mapGithubContributorsForImport([
        {
          id: null,
          login: 'ghost',
          contributions: 10,
          type: 'User',
        },
        {
          id: 456,
          login: 'dependabot[bot]',
          contributions: 7,
          type: 'Bot',
        },
        {
          id: 789,
          login: 'teammate',
          contributions: 3,
          type: 'User',
        },
      ]),
    ).toEqual([
      {
        githubId: 789,
        githubUsername: 'teammate',
        commitCount: 3,
      },
    ])
  })
})

describe('isProjectContributorSyncDue', () => {
  const now = Date.UTC(2026, 5, 23)

  it('syncs projects that have never completed a contributor sync', () => {
    expect(
      isProjectContributorSyncDue({
        lastSyncAttemptedAt: null,
        lastSyncedAt: null,
        now,
        syncCadence: 'weekly',
      }),
    ).toBe(true)
  })

  it('throttles failed attempts inside the retry window', () => {
    expect(
      isProjectContributorSyncDue({
        lastSyncAttemptedAt: now - CONTRIBUTOR_SYNC_RETRY_INTERVAL_MS + 1,
        lastSyncedAt: null,
        now,
        syncCadence: 'weekly',
      }),
    ).toBe(false)
  })

  it('syncs projects stale by cadence after the retry window', () => {
    expect(
      isProjectContributorSyncDue({
        lastSyncAttemptedAt: now - CONTRIBUTOR_SYNC_RETRY_INTERVAL_MS,
        lastSyncedAt: now - 7 * 24 * 60 * 60 * 1000,
        now,
        syncCadence: 'weekly',
      }),
    ).toBe(true)
  })

  it('skips projects still fresh by cadence', () => {
    expect(
      isProjectContributorSyncDue({
        lastSyncAttemptedAt: now - CONTRIBUTOR_SYNC_RETRY_INTERVAL_MS,
        lastSyncedAt: now - 6 * 24 * 60 * 60 * 1000,
        now,
        syncCadence: 'weekly',
      }),
    ).toBe(false)
  })

  it('lets manual refresh-all backfills bypass attempt throttling', () => {
    expect(
      isProjectContributorSyncDue({
        lastSyncAttemptedAt: now - 1,
        lastSyncedAt: now - 1,
        now,
        refreshAll: true,
        syncCadence: 'monthly',
      }),
    ).toBe(true)
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
