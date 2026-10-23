'use node'

import { createClerkClient } from '@clerk/backend'
import { ConvexError, v } from 'convex/values'
import { makeFunctionReference } from 'convex/server'
import { internalAction } from './_generated/server'
import {
  assertDevelopmentFixtureTarget,
  type FixtureIdentities,
} from './lib/development_fixture_contracts'
import { resolveDevelopmentFixtureIdentities } from './lib/development_fixture_identities'

type Summary = {
  generation: number
  stage: number
  status: 'resetting' | 'ready'
}
const beginRef = makeFunctionReference<
  'mutation',
  {
    identities: FixtureIdentities
    confirmTarget: string
    requestKey: string
    reset?: boolean
  },
  Summary
>('developmentFixtures:begin')

export const prepare = internalAction({
  args: {
    clerkIds: v.object({
      populated: v.string(),
      empty: v.string(),
      onboarding: v.string(),
    }),
    confirmTarget: v.string(),
    requestKey: v.string(),
    reset: v.optional(v.boolean()),
  },
  returns: v.object({
    generation: v.number(),
    stage: v.number(),
    status: v.union(v.literal('resetting'), v.literal('ready')),
  }),
  handler: async (ctx, args): Promise<Summary> => {
    const { allowedClerkIds } = assertDevelopmentFixtureTarget(
      args.confirmTarget,
    )
    const ids = (['populated', 'empty', 'onboarding'] as const).map(
      (role) => args.clerkIds[role],
    )
    if (
      new Set(ids).size !== 3 ||
      ids.some((id) => !allowedClerkIds.includes(id) || !id.startsWith('user_'))
    )
      throw new ConvexError(
        'Fixture user IDs must match the development allowlist',
      )
    const clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY!,
    })
    const users = await Promise.all(ids.map((id) => clerk.users.getUser(id)))
    const identities = resolveDevelopmentFixtureIdentities(args.clerkIds, users)
    return await ctx.runMutation(beginRef, {
      identities,
      confirmTarget: args.confirmTarget,
      requestKey: args.requestKey,
      ...(args.reset === undefined ? {} : { reset: args.reset }),
    })
  },
})
