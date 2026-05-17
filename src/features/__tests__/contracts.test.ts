import { describe, expect, it } from 'vitest'

import {
  mapPrivateProfile,
  mapProjectDetail,
  mapPublicProfile,
  mapViewer,
} from '../contracts'

describe('contract mappers', () => {
  it('falls back to the github username when display name is blank', () => {
    const mapped = mapViewer(
      {
        _id: 'user_1',
        appearInExplore: true,
        exploreConfig: { cityIds: [], stackPrefs: [] },
        github: { username: 'octocat' },
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
        onboardingCompletedAt: 1,
        pinnedOwnedProjectIds: [],
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
          followersCount: 2,
          followingCount: 3,
          likesReceivedCount: 1,
          projectsCount: 4,
          updatesCount: 0,
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
        onboardingCompletedAt: null,
        pinnedOwnedProjectIds: [],
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
          followersCount: 0,
          followingCount: 0,
          likesReceivedCount: 0,
          projectsCount: 0,
          updatesCount: 0,
        },
      },
    } as never)

    const publicProfile = mapPublicProfile({
      comments: [],
      githubUsername: 'octocat',
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
        followersCount: 8,
        followingCount: 4,
        likesReceivedCount: 0,
        projectsCount: 2,
        updatesCount: 0,
      },
      userId: 'user_1',
      viewerFollowsProfile: true,
    } as never)

    expect(privateProfile?.viewer.cityName).toBe('Bengaluru, India')
    expect(publicProfile?.viewerFollowsProfile).toBe(true)
    expect(publicProfile?.profile.city).toBe('Berlin, Germany')
  })

  it('returns null when project detail is absent', () => {
    expect(mapProjectDetail(null)).toBeNull()
  })
})
