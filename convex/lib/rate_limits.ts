import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { ConvexError } from 'convex/values'

import { components } from '../_generated/api'
import type { ActionCtx, MutationCtx } from '../_generated/server'

const rateLimiter = new RateLimiter(components.rateLimiter, {
  commentCreate: {
    kind: 'token bucket',
    rate: 12,
    period: MINUTE,
    capacity: 6,
  },
  conversationMessage: {
    kind: 'token bucket',
    rate: 20,
    period: MINUTE,
    capacity: 8,
  },
  githubContributionSync: {
    kind: 'fixed window',
    rate: 4,
    period: HOUR,
  },
  githubMetadataRefresh: {
    kind: 'fixed window',
    rate: 12,
    period: HOUR,
  },
  githubProjectContributorSync: {
    kind: 'fixed window',
    rate: 50,
    period: HOUR,
  },
  githubUserIdentityBackfill: {
    kind: 'fixed window',
    rate: 50,
    period: HOUR,
  },
  githubRepoImport: {
    kind: 'token bucket',
    rate: 8,
    period: HOUR,
    capacity: 4,
  },
  githubRepoList: {
    kind: 'token bucket',
    rate: 20,
    period: HOUR,
    capacity: 8,
  },
  contentReport: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 5,
  },
  followWrite: {
    kind: 'token bucket',
    rate: 60,
    period: MINUTE,
    capacity: 20,
  },
  postEdit: {
    kind: 'token bucket',
    rate: 30,
    period: HOUR,
    capacity: 10,
  },
  postWrite: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 5,
  },
  profileUpdate: {
    kind: 'token bucket',
    rate: 30,
    period: HOUR,
    capacity: 10,
  },
  saveWrite: {
    kind: 'token bucket',
    rate: 60,
    period: MINUTE,
    capacity: 20,
  },
  emailTestSend: {
    kind: 'fixed window',
    rate: 5,
    period: HOUR,
  },
  reactionWrite: {
    kind: 'token bucket',
    rate: 80,
    period: MINUTE,
    capacity: 20,
  },
})

type RateLimitCtx = Pick<MutationCtx | ActionCtx, 'runQuery' | 'runMutation'>

type RateLimitName =
  | 'commentCreate'
  | 'contentReport'
  | 'conversationMessage'
  | 'followWrite'
  | 'githubContributionSync'
  | 'githubMetadataRefresh'
  | 'githubProjectContributorSync'
  | 'githubUserIdentityBackfill'
  | 'githubRepoImport'
  | 'githubRepoList'
  | 'emailTestSend'
  | 'postEdit'
  | 'postWrite'
  | 'profileUpdate'
  | 'reactionWrite'
  | 'saveWrite'

export async function enforceRateLimit(
  ctx: RateLimitCtx,
  name: RateLimitName,
  key: string,
) {
  const status = await rateLimiter.limit(ctx, name, { key })

  if (!status.ok) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((status.retryAfter ?? 1000) / 1000),
    )
    throw new ConvexError(
      `Too many requests. Try again in ${retryAfterSeconds}s.`,
    )
  }
}
