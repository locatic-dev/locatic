import { createClerkClient } from '@clerk/backend'

export interface ClerkPrimaryEmail {
  clerkId: string
  /** null when the Clerk user has no primary address. */
  email: string | null
  verified: boolean
}

/**
 * Primary addresses for up to 100 Clerk users. Users Clerk no longer has are
 * left out; users without a primary address come back with `email: null`.
 * Isolated so tests can mock it.
 */
export async function listClerkPrimaryEmails(
  clerkIds: string[],
): Promise<ClerkPrimaryEmail[]> {
  if (clerkIds.length === 0) return []
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is required')
  const clerk = createClerkClient({ secretKey })
  const { data } = await clerk.users.getUserList({
    userId: clerkIds,
    limit: 100,
  })
  return data.map((user) => {
    const primary = user.primaryEmailAddress
    return {
      clerkId: user.id,
      email: primary?.emailAddress ?? null,
      verified: primary?.verification?.status === 'verified',
    }
  })
}

/** Seconds to wait when Clerk rate-limits us (429), or null otherwise. */
export function clerkRetryAfterSeconds(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const { status, retryAfter } = error as {
    status?: unknown
    retryAfter?: unknown
  }
  if (status !== 429) return null
  return typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 60
}
