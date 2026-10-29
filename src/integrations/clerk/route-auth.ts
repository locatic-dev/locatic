import type { SessionAuthObject } from '@clerk/backend'
import { isClerkAPIResponseError } from '@clerk/backend/errors'
import type { RouteAuthState } from '@/lib/auth-routing'

function isMissingClerkResource(error: unknown) {
  return (
    isClerkAPIResponseError(error) &&
    error.status === 404 &&
    error.errors.some((item) => item.code === 'resource_not_found')
  )
}

/** Resolve the cookie/token race without hiding missing-template or service errors. */
export async function resolveClerkRouteAuth(
  session: SessionAuthObject,
  readSession: (id: string) => Promise<{ status: string }>,
): Promise<RouteAuthState> {
  const signedOut: RouteAuthState = {
    isAuthenticated: false,
    token: null,
    userId: null,
  }
  if (!session.isAuthenticated) return signedOut

  try {
    const token = await session.getToken(
      session.sessionClaims?.aud === 'convex'
        ? undefined
        : { template: 'convex' },
    )
    return { isAuthenticated: true, token, userId: session.userId }
  } catch (error) {
    if (!isMissingClerkResource(error)) throw error

    // JWT cookies can outlive sign-out. Both missing sessions and missing JWT
    // templates use this error code, so check the session only on this failure.
    let currentSession: { status: string }
    try {
      currentSession = await readSession(session.sessionId)
    } catch (sessionError) {
      if (isMissingClerkResource(sessionError)) return signedOut
      throw sessionError
    }
    if (currentSession.status !== 'active') return signedOut
    throw error
  }
}
