import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from '../_generated/server'
import { getViewerAuthState } from './auth'
import type { Doc } from './types'

type EmailAdminCtx = Pick<QueryCtx | MutationCtx, 'auth' | 'db'>

export function getConfiguredEmailAdminSubjects(
  value: string | undefined = process.env.EMAIL_ADMIN_CLERK_IDS,
) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((subject) => subject.trim())
      .filter(Boolean),
  )
}

/** Allowlisted (EMAIL_ADMIN_CLERK_IDS) and active. */
export function isEmailAdminViewer(
  identitySubject: string,
  viewer: Pick<Doc<'users'>, 'deletedAt' | 'deactivatedAt'>,
) {
  return (
    !viewer.deletedAt &&
    !viewer.deactivatedAt &&
    getConfiguredEmailAdminSubjects().has(identitySubject)
  )
}

export async function requireEmailAdmin(ctx: EmailAdminCtx) {
  const state = await getViewerAuthState(ctx)
  if (state.kind === 'unauthenticated') {
    throw new ConvexError('Unauthorized')
  }
  if (state.kind === 'missingViewer') {
    throw new ConvexError('Viewer not found')
  }
  if (state.viewer.deletedAt || state.viewer.deactivatedAt) {
    throw new ConvexError('Email admin account is inactive')
  }
  if (!isEmailAdminViewer(state.identity.subject, state.viewer)) {
    throw new ConvexError('Email admin access required')
  }

  return state.viewer
}
