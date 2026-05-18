import { describe, expect, test } from 'vitest'

import { createDefaultViewerProfile } from '../viewer'

describe('createDefaultViewerProfile', () => {
  test('creates onboarding-safe privacy and notification defaults', () => {
    const profile = createDefaultViewerProfile({
      clerkId: 'clerk_123',
      email: 'user@example.com',
      githubId: 42,
      githubUsername: 'octocat',
      githubUrl: 'https://github.com/octocat',
      avatarUrl: 'https://example.com/avatar.png',
      displayName: 'Octo Cat',
    })

    expect(profile.privacy.profileVisibility).toBe('public')
    expect(profile.privacy.commentHistoryVisibility).toBe('public')
    expect(profile.privacy.likedProjectsVisibility).toBe('public')
    expect(profile.privacy.appearInPulse).toBe(true)
    expect(profile.notificationPrefs.weeklyDigest).toBe(false)
    expect(profile.onboardingCompletedAt).toBeNull()
  })

  test('derives discoverability search text from username and display name', () => {
    const profile = createDefaultViewerProfile({
      clerkId: 'clerk_123',
      email: 'user@example.com',
      githubId: 42,
      githubUsername: 'octocat',
      githubUrl: 'https://github.com/octocat',
      avatarUrl: 'https://example.com/avatar.png',
      displayName: 'Octo Cat',
    })

    expect(profile.discoverability?.searchText).toBe('octocat octo cat')
  })
})
