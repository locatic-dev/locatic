import { ConvexError } from 'convex/values'

import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'
import { createDefaultViewerProfile } from './viewer'

type AuthCapableCtx =
  | Pick<QueryCtx, 'auth'>
  | Pick<MutationCtx, 'auth'>
  | Pick<ActionCtx, 'auth'>

export type ViewerRecord = Awaited<ReturnType<typeof getViewerByClerkId>>
export type AuthIdentity = Record<string, unknown> & {
  subject: string
}

export type ViewerAuthState =
  | {
      kind: 'unauthenticated'
      identity: null
      viewer: null
    }
  | {
      kind: 'missingViewer'
      identity: AuthIdentity
      viewer: null
    }
  | {
      kind: 'ready'
      identity: AuthIdentity
      viewer: NonNullable<ViewerRecord>
    }

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
  const state = await getViewerAuthState(ctx)
  if (state.kind !== 'ready') {
    return null
  }

  return state.viewer
}

export async function getViewerAuthState(
  ctx: Pick<QueryCtx, 'auth' | 'db'> | Pick<MutationCtx, 'auth' | 'db'>,
): Promise<ViewerAuthState> {
  const identity = (await ctx.auth.getUserIdentity()) as AuthIdentity | null
  if (!identity) {
    return {
      kind: 'unauthenticated',
      identity: null,
      viewer: null,
    }
  }

  const viewer = await getViewerByClerkId(ctx, identity.subject)
  if (!viewer) {
    return {
      kind: 'missingViewer',
      identity,
      viewer: null,
    }
  }

  return {
    kind: 'ready',
    identity,
    viewer,
  }
}

export async function getViewerOrThrow(
  ctx: Pick<QueryCtx, 'auth' | 'db'> | Pick<MutationCtx, 'auth' | 'db'>,
) {
  const state = await getViewerAuthState(ctx)
  if (state.kind === 'unauthenticated') {
    throw new ConvexError('Unauthorized')
  }

  if (state.kind === 'missingViewer') {
    throw new ConvexError('Viewer not found')
  }

  return state.viewer
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

export function buildViewerSeedFromIdentity(identity: AuthIdentity) {
  const email = getIdentityEmail(identity)
  const displayName = getIdentityDisplayName(identity, email)
  const githubUsername = getIdentityGithubUsername(
    identity,
    identity.subject,
    email,
  )
  const avatarUrl = getIdentityAvatarUrl(identity)

  return {
    clerkId: identity.subject,
    email,
    displayName,
    githubUsername,
    githubUrl: githubUsername
      ? `https://github.com/${githubUsername}`
      : 'https://github.com',
    avatarUrl,
  }
}

export async function getOrCreateViewer(ctx: MutationCtx) {
  const identity = (await requireIdentity(ctx)) as AuthIdentity

  const existingViewer = await getViewerByClerkId(ctx, identity.subject)
  if (existingViewer) {
    return existingViewer
  }

  const seed = buildViewerSeedFromIdentity(identity)
  const viewerId = await ctx.db.insert(
    'users',
    createDefaultViewerProfile({
      clerkId: seed.clerkId,
      email: seed.email,
      githubId: null,
      githubUsername: seed.githubUsername,
      githubUrl: seed.githubUrl,
      avatarUrl: seed.avatarUrl,
      displayName: seed.displayName,
    }),
  )

  return await ctx.db.get(viewerId)
}
