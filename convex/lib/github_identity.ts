import { ConvexError } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

export async function assertGithubUsernameAvailable(
  ctx: MutationCtx,
  githubUsername: string,
  options: { exceptUserId?: Id<'users'> } = {},
) {
  const username = githubUsername.trim()
  if (!username) {
    return
  }

  const matchingUsers = await ctx.db
    .query('users')
    .withIndex('by_github_username', (query) =>
      query.eq('github.username', username),
    )
    .take(2)

  const conflictingUser = matchingUsers.find(
    (user) => user._id !== options.exceptUserId && user.deletedAt === null,
  )
  if (conflictingUser) {
    throw new ConvexError('GitHub username is already linked to another user')
  }
}
