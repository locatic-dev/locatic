import { describe, expect, test } from 'vitest'

import { ConvexError } from 'convex/values'

import {
  buildViewerSeedFromIdentity,
  getViewerAuthState,
  getViewerOrThrow,
} from '../auth'

function makeAuthCtx({
  identity,
  viewer,
}: {
  identity: Record<string, unknown> | null
  viewer: unknown
}) {
  return {
    auth: {
      getUserIdentity: async () => identity,
    },
    db: {
      query: () => ({
        withIndex: () => ({
          unique: async () => viewer,
        }),
      }),
    },
  } as never
}

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

describe('viewer auth helpers', () => {
  test('classifies calls without an identity as unauthenticated', async () => {
    const ctx = makeAuthCtx({ identity: null, viewer: null })

    await expect(getViewerOrThrow(ctx)).rejects.toMatchObject({
      data: 'Unauthorized',
    } satisfies Partial<ConvexError<string>>)

    await expect(getViewerAuthState(ctx)).resolves.toEqual({
      kind: 'unauthenticated',
      identity: null,
      viewer: null,
    })
  })

  test('classifies authenticated calls without a viewer row separately', async () => {
    const identity = { subject: 'user_missing' }
    const ctx = makeAuthCtx({ identity, viewer: null })

    await expect(getViewerOrThrow(ctx)).rejects.toMatchObject({
      data: 'Viewer not found',
    } satisfies Partial<ConvexError<string>>)

    await expect(getViewerAuthState(ctx)).resolves.toEqual({
      kind: 'missingViewer',
      identity,
      viewer: null,
    })
  })

  test('returns the viewer when identity and viewer row are both present', async () => {
    const identity = { subject: 'user_123' }
    const viewer = { _id: 'viewer_123', clerkId: 'user_123' }
    const ctx = makeAuthCtx({ identity, viewer })

    await expect(getViewerOrThrow(ctx)).resolves.toBe(viewer)
    await expect(getViewerAuthState(ctx)).resolves.toEqual({
      kind: 'ready',
      identity,
      viewer,
    })
  })
})
