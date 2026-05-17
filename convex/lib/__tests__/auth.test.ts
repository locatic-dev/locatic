import { describe, expect, test } from 'vitest'

import { buildViewerSeedFromIdentity } from '../auth'

describe('buildViewerSeedFromIdentity', () => {
  test('prefers provider-derived profile fields when available', () => {
    const seed = buildViewerSeedFromIdentity({
      subject: 'user_123',
      email: 'user@example.com',
      name: 'Octo Cat',
      preferredUsername: 'octocat',
      pictureUrl: 'https://example.com/avatar.png',
    })

    expect(seed).toEqual({
      clerkId: 'user_123',
      email: 'user@example.com',
      displayName: 'Octo Cat',
      githubUsername: 'octocat',
      githubUrl: 'https://github.com/octocat',
      avatarUrl: 'https://example.com/avatar.png',
    })
  })

  test('falls back to email-derived defaults when GitHub-style claims are absent', () => {
    const seed = buildViewerSeedFromIdentity({
      subject: 'user_456',
      tokenIdentifier: 'clerk|fallback@example.com',
    })

    expect(seed).toEqual({
      clerkId: 'user_456',
      email: 'fallback@example.com',
      displayName: 'fallback',
      githubUsername: 'fallback',
      githubUrl: 'https://github.com/fallback',
      avatarUrl: 'https://github.com/identicons/locatic.png',
    })
  })
})
