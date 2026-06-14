import { describe, expect, it } from 'vitest'

import {
  mapGithubReleaseForImport,
  shouldDeleteMissingProjectReleasesAfterImport,
} from '../../github_actions'

describe('GitHub release import helpers', () => {
  it('maps GitHub release payloads into the project release record shape', () => {
    expect(
      mapGithubReleaseForImport({
        body: 'Release notes',
        created_at: '2026-06-01T10:00:00.000Z',
        draft: false,
        html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
        id: 123,
        name: 'Version 1',
        prerelease: false,
        published_at: '2026-06-01T11:00:00.000Z',
        tag_name: 'v1.0.0',
        updated_at: '2026-06-01T12:00:00.000Z',
      }),
    ).toEqual({
      body: 'Release notes',
      createdAt: Date.parse('2026-06-01T10:00:00.000Z'),
      githubReleaseId: 123,
      htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
      isDraft: false,
      isPrerelease: false,
      name: 'Version 1',
      publishedAt: Date.parse('2026-06-01T11:00:00.000Z'),
      tagName: 'v1.0.0',
      updatedAt: Date.parse('2026-06-01T12:00:00.000Z'),
    })
  })

  it('deletes missing releases only after an exhausted release sync', () => {
    expect(
      shouldDeleteMissingProjectReleasesAfterImport({ exhausted: true }),
    ).toBe(true)
    expect(
      shouldDeleteMissingProjectReleasesAfterImport({ exhausted: false }),
    ).toBe(false)
  })
})
