import { buildDiscoverabilitySearchText } from './discoverability'

export interface CreateDefaultViewerProfileOptions {
  clerkId: string
  email: string
  githubId: number | null
  githubUsername: string
  githubUrl: string
  avatarUrl: string
  displayName: string
}

export function createDefaultViewerProfile(
  options: CreateDefaultViewerProfileOptions,
) {
  const now = Date.now()

  return {
    clerkId: options.clerkId,
    email: options.email,
    github: {
      id: options.githubId,
      username: options.githubUsername,
    },
    profile: {
      displayName: options.displayName,
      fullName: options.displayName,
      avatarUrl: options.avatarUrl,
      bio: '',
      cityId: null,
      buildStatus: 'just_exploring' as const,
      primaryLanguages: [],
      socialLinks: {
        github: options.githubUrl,
        x: null,
        linkedin: null,
        bluesky: null,
        website: null,
      },
    },
    pinnedProfileProjectIds: [],
    onboardingSelectedOwnedProjectIds: [],
    unreadMessagesCount: 0,
    stats: {
      followersCount: 0,
      followingCount: 0,
      projectsCount: 0,
      postsCount: 0,
      contributionsCount: 0,
      commentsCount: 0,
      likedCount: 0,
    },
    exploreConfig: {
      cityIds: [],
      stackPrefs: [],
    },
    appearInExplore: true,
    discoverability: {
      searchText: buildDiscoverabilitySearchText(
        options.githubUsername,
        options.displayName,
      ),
    },
    privacy: {
      profileVisibility: 'public' as const,
      followGraphVisibility: 'public' as const,
      commentHistoryVisibility: 'public' as const,
      likedProjectsVisibility: 'public' as const,
      contributionsVisibility: 'public' as const,
      cityVisibility: 'exact_city' as const,
      appearInPulse: true,
    },
    notificationPrefs: {
      projectLikes: true,
      updateLikes: true,
      comments: true,
      commentReplies: true,
      newFollowers: true,
      dms: false,
      weeklyDigest: false,
      contributorRecognized: true,
      productUpdates: true,
    },
    emailVerified: false,
    githubLastSyncedAt: null,
    onboardingCompletedAt: null,
    createdAt: now,
    updatedAt: now,
    deactivatedAt: null,
    deletedAt: null,
    purgeAfter: null,
    purgedAt: null,
  }
}
