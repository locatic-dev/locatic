import { describe, expect, it } from 'vitest'

import {
  buildOptimisticSelfProjectPreview,
  buildRepositoryManagerItems,
  filterRepositoryManagerItems,
  getRepositoryViewQueryKeys,
  sortVisibleProjectPreviews,
  updatePinnedProjectIds,
  updateVisibleProjectPreviews,
} from '../repository-manager'

describe('buildRepositoryManagerItems', () => {
  it('merges imported projects with GitHub repositories and derives statuses', () => {
    const items = buildRepositoryManagerItems({
      githubRepositories: [
        {
          fullName: 'avinash/visible-repo',
          name: 'visible-repo',
          description: 'Visible on profile',
          primaryLanguage: 'TypeScript',
          stargazersCount: 10,
        },
        {
          fullName: 'avinash/new-repo',
          name: 'new-repo',
          description: 'Available to import',
          primaryLanguage: 'Rust',
          stargazersCount: 25,
        },
      ],
      pinnedProjectIds: ['project_visible' as any],
      projects: [
        {
          _id: 'project_hidden',
          github: {
            fullName: 'avinash/hidden-repo',
            name: 'hidden-repo',
            description: 'Hidden from profile',
            primaryLanguage: 'Go',
            stargazersCount: 3,
          },
          locatic: {
            isVisible: false,
          },
          updatedAt: 20,
        },
        {
          _id: 'project_visible',
          github: {
            fullName: 'avinash/visible-repo',
            name: 'visible-repo',
            description: 'Visible on profile',
            primaryLanguage: 'TypeScript',
            stargazersCount: 8,
          },
          locatic: {
            isVisible: true,
          },
          updatedAt: 30,
        },
      ] as any,
    })

    expect(items.map((item) => [item.fullName, item.status])).toEqual([
      ['avinash/visible-repo', 'on_profile'],
      ['avinash/hidden-repo', 'hidden'],
      ['avinash/new-repo', 'available'],
    ])
    expect(items[0]).toMatchObject({
      fullName: 'avinash/visible-repo',
      isPinned: true,
      stargazersCount: 10,
      isMissingFromGithub: false,
    })
    expect(items[1]).toMatchObject({
      fullName: 'avinash/hidden-repo',
      isPinned: false,
      isMissingFromGithub: true,
    })
  })
})

describe('filterRepositoryManagerItems', () => {
  it('matches name, description, and primary language', () => {
    const items = [
      {
        fullName: 'avinash/locatic',
        name: 'locatic',
        description: 'Map-based developer discovery',
        primaryLanguage: 'TypeScript',
        stargazersCount: 10,
        projectId: null,
        status: 'available' as const,
        isPinned: false,
        isMissingFromGithub: false,
        updatedAt: null,
      },
    ]

    expect(filterRepositoryManagerItems(items, 'discover')).toHaveLength(1)
    expect(filterRepositoryManagerItems(items, 'typescript')).toHaveLength(1)
    expect(filterRepositoryManagerItems(items, 'missing')).toHaveLength(0)
  })
})

describe('optimistic preview helpers', () => {
  const project = {
    _id: 'project_visible',
    ownerId: 'user_1',
    github: {
      fullName: 'avinash/locatic',
      name: 'locatic',
      description: 'Map-based discovery',
      primaryLanguage: 'TypeScript',
      languages: [{ name: 'TypeScript', bytes: 100 }],
      stargazersCount: 42,
      lastCommitAt: 1,
    },
    locatic: {
      commentsCount: 3,
      isVisible: true,
      likesCount: 5,
    },
    ownerSnapshot: {
      avatarUrl: 'snapshot-avatar',
      displayName: 'Snapshot Name',
    },
    updatedAt: 9,
  } as any

  it('builds private and public previews from the current overview city', () => {
    const privatePreview = buildOptimisticSelfProjectPreview({
      audience: 'private',
      overview: {
        cityName: 'Bengaluru, Karnataka, India',
        viewer: {
          profile: {
            avatarUrl: 'viewer-avatar',
            displayName: 'Avinash',
          },
        },
      } as any,
      project,
      profileUsername: 'avinash',
    })

    const publicPreview = buildOptimisticSelfProjectPreview({
      audience: 'public',
      overview: {
        privacy: {
          cityVisibility: 'region_only',
        },
        profile: {
          avatarUrl: 'viewer-avatar',
          city: 'Karnataka, India',
          displayName: 'Avinash',
        },
      } as any,
      project,
      profileUsername: 'avinash',
    })

    expect(privatePreview.cityLabel).toBe('Bengaluru, Karnataka, India')
    expect(privatePreview.cityVisibilityState).toBe('exact_city')
    expect(publicPreview.cityLabel).toBe('Karnataka, India')
    expect(publicPreview.cityVisibilityState).toBe('region_only')
  })

  it('removes hidden previews and restores them in pinned-aware order', () => {
    const olderPreview = {
      projectId: 'project_older',
      ownerUserId: 'user_1',
      fullName: 'avinash/older',
      owner: 'avinash',
      repo: 'older',
      description: null,
      primaryLanguage: null,
      languages: [],
      githubStars: 1,
      locaticLikes: 1,
      commentsCount: 1,
      lastCommitAt: 1,
      updatedAt: 3,
      authorName: 'Avinash',
      authorHandle: 'avinash',
      authorAvatarUrl: null,
      cityLabel: 'Bengaluru, India',
      cityVisibilityState: 'exact_city',
    } as any

    const visible = updateVisibleProjectPreviews({
      previews: [olderPreview],
      project,
      projectId: project._id,
      isVisible: true,
      pinnedProjectIds: [project._id as any],
      overview: {
        cityName: 'Bengaluru, India',
        viewer: {
          profile: {
            avatarUrl: 'viewer-avatar',
            displayName: 'Avinash',
          },
        },
      } as any,
      audience: 'private',
      profileUsername: 'avinash',
    })

    expect(visible?.map((item) => String(item.projectId))).toEqual([
      'project_visible',
      'project_older',
    ])

    const hidden = updateVisibleProjectPreviews({
      previews: visible,
      project,
      projectId: project._id,
      isVisible: false,
      pinnedProjectIds: [],
      overview: null,
      audience: 'private',
      profileUsername: 'avinash',
    })

    expect(hidden?.map((item) => String(item.projectId))).toEqual([
      'project_older',
    ])
  })

  it('updates pinned ids and resorts previews', () => {
    const previews = [
      {
        projectId: 'project_older',
        updatedAt: 1,
      },
      {
        projectId: 'project_visible',
        updatedAt: 9,
      },
    ] as any

    const nextPinnedIds = updatePinnedProjectIds(
      ['project_older' as any],
      'project_visible' as any,
      true,
    )

    expect(nextPinnedIds.map(String)).toEqual([
      'project_older',
      'project_visible',
    ])
    expect(
      sortVisibleProjectPreviews(previews, nextPinnedIds)?.map((item) =>
        String(item.projectId),
      ),
    ).toEqual(['project_visible', 'project_older'])
  })

  it('keeps repository invalidation scoped to profile-related query keys', () => {
    const keys = getRepositoryViewQueryKeys({
      mineProjectsQueryKey: ['mine'],
      privateProfileOverviewQueryKey: ['private-overview'],
      privateProfileProjectsQueryKey: ['private-projects'],
      publicProfileOverviewQueryKey: ['public-overview'],
      publicProfileProjectsQueryKey: ['public-projects'],
    })

    expect(keys).toEqual([
      ['mine'],
      ['private-overview'],
      ['private-projects'],
      ['public-overview'],
      ['public-projects'],
    ])
  })
})
