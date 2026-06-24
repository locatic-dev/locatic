import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import {
  mapGithubUserIdentityForBackfill,
  type GithubUserIdentity,
} from './github'

export const userGithubIdBackfillResultValidator = v.object({
  error: v.union(v.string(), v.null()),
  githubId: v.union(v.number(), v.null()),
  status: v.union(
    v.literal('dry_run'),
    v.literal('updated'),
    v.literal('already_set'),
    v.literal('missing_user'),
    v.literal('skipped_existing_id'),
    v.literal('skipped_conflict'),
    v.literal('invalid_github_user'),
    v.literal('not_found'),
    v.literal('failed'),
  ),
  userId: v.id('users'),
  username: v.string(),
})

export const userGithubIdBackfillSummaryValidator = v.object({
  dryRun: v.boolean(),
  failed: v.number(),
  invalid: v.number(),
  limit: v.number(),
  notFound: v.number(),
  results: v.array(userGithubIdBackfillResultValidator),
  scanned: v.number(),
  skipped: v.number(),
  updated: v.number(),
})

export type UserGithubIdBackfillTarget = {
  userId: Id<'users'>
  username: string
}

type UserGithubIdPatchStatus =
  | 'updated'
  | 'already_set'
  | 'missing_user'
  | 'skipped_existing_id'
  | 'skipped_conflict'

export type UserGithubIdBackfillResult = {
  error: string | null
  githubId: number | null
  status:
    | 'dry_run'
    | UserGithubIdPatchStatus
    | 'invalid_github_user'
    | 'not_found'
    | 'failed'
  userId: Id<'users'>
  username: string
}

export type UserGithubIdBackfillSummary = {
  dryRun: boolean
  failed: number
  invalid: number
  limit: number
  notFound: number
  results: UserGithubIdBackfillResult[]
  scanned: number
  skipped: number
  updated: number
}

export async function runUserGithubIdBackfillTargets(args: {
  dryRun: boolean
  enforceRateLimit: () => Promise<void>
  fetchGithubUser: (username: string) => Promise<GithubUserIdentity>
  getErrorMessage: (error: unknown) => string
  isNotFoundError: (error: unknown) => boolean
  limit: number
  patchGithubId: (
    userId: Id<'users'>,
    githubId: number,
  ) => Promise<{ status: UserGithubIdPatchStatus }>
  targets: UserGithubIdBackfillTarget[]
}): Promise<UserGithubIdBackfillSummary> {
  const results: UserGithubIdBackfillResult[] = []

  for (const target of args.targets) {
    try {
      await args.enforceRateLimit()
      const githubUser = await args.fetchGithubUser(target.username)
      const identity = mapGithubUserIdentityForBackfill(githubUser)

      if (!identity) {
        results.push({
          error: 'GitHub user response did not contain a valid user id',
          githubId: null,
          status: 'invalid_github_user',
          userId: target.userId,
          username: target.username,
        })
        continue
      }

      if (args.dryRun) {
        results.push({
          error: null,
          githubId: identity.githubId,
          status: 'dry_run',
          userId: target.userId,
          username: target.username,
        })
        continue
      }

      const result = await args.patchGithubId(target.userId, identity.githubId)
      results.push({
        error: null,
        githubId: identity.githubId,
        status: result.status,
        userId: target.userId,
        username: target.username,
      })
    } catch (error) {
      results.push({
        error: args.getErrorMessage(error),
        githubId: null,
        status: args.isNotFoundError(error) ? 'not_found' : 'failed',
        userId: target.userId,
        username: target.username,
      })
    }
  }

  return {
    dryRun: args.dryRun,
    failed: results.filter((result) => result.status === 'failed').length,
    invalid: results.filter((result) => result.status === 'invalid_github_user')
      .length,
    limit: args.limit,
    notFound: results.filter((result) => result.status === 'not_found').length,
    results,
    scanned: args.targets.length,
    skipped: results.filter((result) =>
      [
        'already_set',
        'missing_user',
        'skipped_existing_id',
        'skipped_conflict',
      ].includes(result.status),
    ).length,
    updated: results.filter((result) => result.status === 'updated').length,
  }
}
