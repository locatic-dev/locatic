import { describe, expect, it } from 'vitest'

import {
  mapConversationList,
  mapNotifications,
  mapPrivateProfileOverview,
  mapProjectDetail,
  mapViewerLikedProjectIds,
  mapViewerSummary,
  mapViewer,
  mapViewerBootstrap,
} from '../contracts'

describe('contract mappers', () => {
  it('preserves lifecycle-only recovery metadata without a member profile', () => {
    expect(
      mapViewerBootstrap({
        isAuthenticated: true,
        needsOnboarding: false,
        status: 'deletion_pending',
        viewer: null,
        accountLifecycle: { canRestore: true, purgeAfter: 123 },
      }),
    ).toMatchObject({
      status: 'deletion_pending',
      viewer: null,
      accountLifecycle: { canRestore: true, purgeAfter: 123 },
    })
  })

  it('maps explicit and legacy viewer bootstrap auth states', () => {
    expect(
      mapViewerBootstrap({
        isAuthenticated: false,
        needsOnboarding: false,
        status: 'unauthenticated',
        viewer: null,
      }),
    ).toMatchObject({
      isAuthenticated: false,
      needsOnboarding: false,
      status: 'unauthenticated',
      viewer: null,
    })

    expect(
      mapViewerBootstrap({
        isAuthenticated: true,
        needsOnboarding: true,
        viewer: null,
      }),
    ).toMatchObject({
      isAuthenticated: true,
      needsOnboarding: true,
      status: 'missingViewer',
      viewer: null,
    })
  })

  it('falls back to the github username when display name is blank', () => {
    const mapped = mapViewer(
      {
        _id: 'user_1',
        appearInExplore: true,
        exploreConfig: { cityIds: [], stackPrefs: [] },
        github: { username: 'octocat' },
        githubContributions: null,
        notificationPrefs: {
          comments: true,
          commentReplies: true,
          contributorRecognized: true,
          dms: true,
          newFollowers: true,
          projectLikes: true,
          updateLikes: true,
          weeklyDigest: false,
        },
        onboardingSelectedOwnedProjectIds: [],
        onboardingCompletedAt: 1,
        pinnedProfileProjectIds: [],
        privacy: {
          appearInPulse: true,
          cityVisibility: 'exact_city',
          commentHistoryVisibility: 'public',
          followGraphVisibility: 'public',
          likedProjectsVisibility: 'public',
          profileVisibility: 'public',
        },
        profile: {
          avatarUrl: null,
          bio: 'building things',
          buildStatus: 'building_solo',
          cityId: null,
          displayName: '   ',
          socialLinks: {
            bluesky: null,
            github: 'octocat',
            linkedin: null,
            website: null,
            x: null,
          },
        },
        stats: {
          commentsCount: 0,
          contributionsCount: 0,
          followersCount: 2,
          followingCount: 3,
          likedCount: 1,
          projectsCount: 4,
        },
      } as never,
      'Berlin, Germany',
    )

    expect(mapped.displayName).toBe('octocat')
    expect(mapped.cityName).toBe('Berlin, Germany')
    expect(mapped.appearInExplore).toBe(true)
    expect(mapped).not.toHaveProperty('syncGithubStarsOnLike')
  })

  it('maps the lightweight private profile overview payload', () => {
    const privateOverview = mapPrivateProfileOverview({
      cityName: 'Bengaluru, India',
      viewer: {
        _id: 'user_1',
        appearInExplore: false,
        exploreConfig: { cityIds: [], stackPrefs: [] },
        github: { username: 'octocat' },
        githubContributions: null,
        notificationPrefs: {
          comments: true,
          commentReplies: true,
          contributorRecognized: true,
          dms: true,
          newFollowers: true,
          projectLikes: true,
          updateLikes: true,
          weeklyDigest: false,
        },
        onboardingSelectedOwnedProjectIds: [],
        onboardingCompletedAt: null,
        pinnedProfileProjectIds: [],
        privacy: {
          appearInPulse: true,
          cityVisibility: 'exact_city',
          commentHistoryVisibility: 'public',
          followGraphVisibility: 'public',
          likedProjectsVisibility: 'public',
          profileVisibility: 'public',
        },
        profile: {
          avatarUrl: null,
          bio: '',
          buildStatus: 'building_solo',
          cityId: null,
          displayName: 'Octo',
          socialLinks: {
            bluesky: null,
            github: 'octocat',
            linkedin: null,
            website: null,
            x: null,
          },
        },
        stats: {
          commentsCount: 0,
          contributionsCount: 0,
          followersCount: 0,
          followingCount: 0,
          likedCount: 0,
          projectsCount: 0,
        },
        unreadMessagesCount: 0,
      },
    } as never)

    expect(privateOverview?.viewer.cityName).toBe('Bengaluru, India')
  })

  it('maps smaller viewer payloads without collapsing them into private profile', () => {
    const viewerSummary = mapViewerSummary({
      viewerId: 'user_1',
    } as never)
    const likedProjects = mapViewerLikedProjectIds({
      likedProjectIds: ['project_1', 'project_2'],
      viewerId: 'user_1',
    } as never)

    expect(viewerSummary?.id).toBe('user_1')
    expect(likedProjects?.likedProjectIds).toHaveLength(2)
  })

  it('returns null when project detail is absent', () => {
    expect(mapProjectDetail(null)).toBeNull()
  })

  it('preserves imported releases on project detail payloads', () => {
    const detail = mapProjectDetail({
      canonicalRoute: { owner: 'octocat', repo: 'hello-world' },
      comments: [],
      likedByPreview: [],
      owner: {
        avatarUrl: null,
        buildStatus: 'building_solo',
        city: null,
        displayName: 'Octo',
        githubUsername: 'octocat',
        socialLinks: {
          bluesky: null,
          github: 'octocat',
          linkedin: null,
          website: null,
          x: null,
        },
        userId: 'user_1',
      },
      project: { _id: 'project_1' },
      releases: [{ tagName: 'v1.0.0' }],
      viewerFollowsOwner: false,
      viewerHasLiked: false,
    } as never)

    expect(detail?.releases).toEqual([{ tagName: 'v1.0.0' }])
  })

  it('preserves pending conversation and notification payloads', () => {
    expect(mapConversationList(undefined)).toBeUndefined()
    expect(mapNotifications(undefined)).toBeUndefined()
    expect(mapConversationList([])).toEqual([])
    expect(mapNotifications([])).toEqual([])
  })
})
