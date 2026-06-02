import { describe, expect, it } from 'vitest'

import {
  mapConversationList,
  mapNotifications,
  mapPrivateProfile,
  mapPrivateProfileOverview,
  mapProjectDetail,
  mapPublicProfile,
  mapPublicProfileOverview,
  mapViewerInboxSummary,
  mapViewerLikedProjectIds,
  mapViewerSummary,
  mapViewer,
  mapViewerBootstrap,
} from '../contracts'

describe('contract mappers', () => {
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
        syncGithubStarsOnLike: false,
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
  })

  it('maps nested private and public profile payloads', () => {
    const privateProfile = mapPrivateProfile({
      cityName: 'Bengaluru, India',
      comments: [],
      likedProjects: [],
      projects: [],
      viewer: {
        _id: 'user_1',
        appearInExplore: false,
        exploreConfig: { cityIds: [], stackPrefs: ['TypeScript'] },
        github: { username: 'octocat' },
        githubContributions: {
          totalContributions: 12,
          syncedAt: 123,
          weeks: [
            {
              days: [{ count: 2, date: '2026-05-01' }],
            },
          ],
        },
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
        syncGithubStarsOnLike: true,
        profile: {
          avatarUrl: null,
          bio: '',
          buildStatus: 'just_exploring',
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
      },
      contributions: [],
      followers: [],
      following: [],
    } as never)

    const publicProfile = mapPublicProfile({
      comments: [],
      contributions: [],
      followers: [],
      githubUsername: 'octocat',
      following: [],
      likedProjects: [],
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
        bio: 'hello',
        buildStatus: 'building_solo',
        city: 'Berlin, Germany',
        displayName: 'Octo',
        socialLinks: {
          bluesky: null,
          github: 'octocat',
          linkedin: null,
          website: null,
          x: null,
        },
      },
      projects: [],
      stats: {
        commentsCount: 0,
        contributionsCount: 0,
        followersCount: 8,
        followingCount: 4,
        likedCount: 0,
        projectsCount: 2,
      },
      userId: 'user_1',
      viewerFollowsProfile: true,
    } as never)

    expect(privateProfile?.viewer.cityName).toBe('Bengaluru, India')
    expect(privateProfile?.viewer.githubContributions?.totalContributions).toBe(
      12,
    )
    expect(publicProfile?.viewerFollowsProfile).toBe(true)
    expect(publicProfile?.profile.city).toBe('Berlin, Germany')
  })

  it('maps lightweight profile overview payloads', () => {
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
        syncGithubStarsOnLike: false,
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

    const publicOverview = mapPublicProfileOverview({
      githubUsername: 'octocat',
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
        bio: 'hello',
        buildStatus: 'building_solo',
        city: 'Berlin, Germany',
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
        followersCount: 8,
        followingCount: 4,
        likedCount: 0,
        projectsCount: 2,
      },
      userId: 'user_1',
      viewerFollowsProfile: true,
    } as never)

    expect(privateOverview?.viewer.cityName).toBe('Bengaluru, India')
    expect(publicOverview?.viewerFollowsProfile).toBe(true)
    expect(publicOverview?.profile.city).toBe('Berlin, Germany')
  })

  it('maps smaller viewer payloads without collapsing them into private profile', () => {
    const viewerSummary = mapViewerSummary({
      viewerId: 'user_1',
    } as never)
    const likedProjects = mapViewerLikedProjectIds({
      likedProjectIds: ['project_1', 'project_2'],
      viewerId: 'user_1',
    } as never)
    const inboxSummary = mapViewerInboxSummary({
      unreadMessages: 3,
      viewerId: 'user_1',
    } as never)

    expect(viewerSummary?.id).toBe('user_1')
    expect(likedProjects?.likedProjectIds).toHaveLength(2)
    expect(inboxSummary?.viewerId).toBe('user_1')
    expect(inboxSummary?.unreadMessages).toBe(3)
  })

  it('returns null when project detail is absent', () => {
    expect(mapProjectDetail(null)).toBeNull()
  })

  it('preserves pending conversation and notification payloads', () => {
    expect(mapConversationList(undefined)).toBeUndefined()
    expect(mapNotifications(undefined)).toBeUndefined()
    expect(mapConversationList([])).toEqual([])
    expect(mapNotifications([])).toEqual([])
  })
})
