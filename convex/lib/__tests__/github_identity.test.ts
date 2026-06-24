import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import { assertGithubUsernameAvailable } from '../github_identity'

function user(id: string, deletedAt: number | null = null) {
  return {
    _id: id as Id<'users'>,
    deletedAt,
  }
}

function makeCtx(users: Array<ReturnType<typeof user>>) {
  return {
    db: {
      query: () => ({
        withIndex: () => ({
          take: async () => users,
        }),
      }),
    },
  } as never
}

describe('assertGithubUsernameAvailable', () => {
  it('throws when another active user already has the GitHub username', async () => {
    await expect(
      assertGithubUsernameAvailable(
        makeCtx([user('user_existing')]),
        'octocat',
      ),
    ).rejects.toMatchObject({
      data: 'GitHub username is already linked to another user',
    } satisfies Partial<ConvexError<string>>)
  })

  it('allows the same user and deleted users to keep the username', async () => {
    await expect(
      assertGithubUsernameAvailable(
        makeCtx([user('user_self'), user('user_deleted', Date.now())]),
        'octocat',
        {
          exceptUserId: 'user_self' as Id<'users'>,
        },
      ),
    ).resolves.toBeUndefined()
  })
})
