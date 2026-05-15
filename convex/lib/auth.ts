import { ConvexError } from 'convex/values'

import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'

type AuthCapableCtx =
  | Pick<QueryCtx, 'auth'>
  | Pick<MutationCtx, 'auth'>
  | Pick<ActionCtx, 'auth'>

export type ViewerRecord = Awaited<ReturnType<typeof getViewerByClerkId>>

export async function requireIdentity(ctx: AuthCapableCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new ConvexError('Unauthorized')
  }

  return identity
}

export async function getViewerByClerkId(
  ctx: Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>,
  clerkId: string,
) {
  return await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (query) => query.eq('clerkId', clerkId))
    .unique()
}

export async function getViewerFromAuth(
  ctx: Pick<QueryCtx, 'auth' | 'db'> | Pick<MutationCtx, 'auth' | 'db'>,
) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return null
  }

  return await getViewerByClerkId(ctx, identity.subject)
}

export async function getViewerOrThrow(
  ctx: Pick<QueryCtx, 'auth' | 'db'> | Pick<MutationCtx, 'auth' | 'db'>,
) {
  const viewer = await getViewerFromAuth(ctx)
  if (!viewer) {
    throw new ConvexError('Viewer not found')
  }

  return viewer
}

function getIdentityEmail(identity: Record<string, unknown>): string {
  if (typeof identity.email === 'string') {
    return identity.email
  }

  if (typeof identity.tokenIdentifier === 'string') {
    const segments = identity.tokenIdentifier.split('|')
    return segments[segments.length - 1] ?? ''
  }

  return ''
}

function getIdentityDisplayName(
  identity: Record<string, unknown>,
  email: string,
): string {
  if (typeof identity.name === 'string' && identity.name.trim().length > 0) {
    return identity.name
  }

  if (
    typeof identity.nickname === 'string' &&
    identity.nickname.trim().length > 0
  ) {
    return identity.nickname
  }

  return email.split('@')[0] || 'Locatic User'
}

function getIdentityAvatarUrl(identity: Record<string, unknown>): string {
  if (
    typeof identity.pictureUrl === 'string' &&
    identity.pictureUrl.length > 0
  ) {
    return identity.pictureUrl
  }

  return 'https://github.com/identicons/locatic.png'
}

function getIdentityGithubUsername(
  identity: Record<string, unknown>,
  clerkId: string,
  email: string,
): string {
  if (
    typeof identity.preferredUsername === 'string' &&
    identity.preferredUsername.trim().length > 0
  ) {
    return identity.preferredUsername
  }

  if (
    typeof identity.nickname === 'string' &&
    identity.nickname.trim().length > 0
  ) {
    return identity.nickname
  }

  return email.split('@')[0] || clerkId
}

export async function getOrCreateViewer(ctx: MutationCtx) {
  const identity = (await requireIdentity(ctx)) as Record<string, unknown> & {
    subject: string
  }

  const existingViewer = await getViewerByClerkId(ctx, identity.subject)
  if (existingViewer) {
    return existingViewer
  }

  const email = getIdentityEmail(identity)
  const displayName = getIdentityDisplayName(identity, email)
  const githubUsername = getIdentityGithubUsername(
    identity,
    identity.subject,
    email,
  )
  const avatarUrl = getIdentityAvatarUrl(identity)
  const now = Date.now()

  const viewerId = await ctx.db.insert('users', {
    clerkId: identity.subject,
    email,
    github: {
      id: null,
      username: githubUsername,
    },
    profile: {
      displayName,
      fullName: displayName,
      avatarUrl,
      bio: '',
      cityId: null,
      buildStatus: 'just_exploring',
      primaryLanguages: [],
      socialLinks: {
        github: githubUsername
          ? `https://github.com/${githubUsername}`
          : 'https://github.com',
        x: null,
        linkedin: null,
        bluesky: null,
        website: null,
      },
    },
    pinnedOwnedProjectIds: [],
    stats: {
      followersCount: 0,
      followingCount: 0,
      projectsCount: 0,
      contributionsCount: 0,
      commentsCount: 0,
      likedCount: 0,
    },
    exploreConfig: {
      cityIds: [],
      stackPrefs: [],
    },
    appearInExplore: true,
    privacy: {
      profileVisibility: 'public',
      followGraphVisibility: 'public',
      commentHistoryVisibility: 'public',
      likedProjectsVisibility: 'public',
      cityVisibility: 'exact_city',
      appearInPulse: true,
    },
    notificationPrefs: {
      projectLikes: true,
      updateLikes: true,
      comments: true,
      commentReplies: true,
      newFollowers: true,
      dms: true,
      weeklyDigest: false,
      contributorRecognized: true,
    },
    githubLastSyncedAt: null,
    onboardingCompletedAt: null,
    createdAt: now,
    updatedAt: now,
    deactivatedAt: null,
    deletedAt: null,
  })

  return await ctx.db.get(viewerId)
}
