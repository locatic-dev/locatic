import { ConvexError, v } from 'convex/values'
import { makeFunctionReference } from 'convex/server'
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import {
  assertDevelopmentFixtureTarget,
  fixtureIdentitiesValidator,
} from './lib/development_fixture_contracts'
import { installDevelopmentFixtures } from './lib/development_fixture_data'
import { startLifecycleOwnerSync } from './lib/lifecycle_owner_sync'

// Children first, users last: every page can still check the identity boundary.
// This is deliberately a fixed application table list, not an arbitrary delete API.
const TABLES = [
  'messages',
  'conversations',
  'notifications',
  'home_feed_items',
  'activity_events',
  'comments',
  'reactions',
  'saved_projects',
  'posts',
  'project_contributors',
  'project_releases',
  'projects',
  'follows',
  'github_tokens',
  'github_sync_log',
  'contributor_sync_config',
  'explore_history',
  'explore_post_history',
  'reports',
  'pulse_snapshots',
  'metrics_daily',
  'webhook_events',
  'email_sends',
  'email_campaigns',
  'email_preference_changes',
  'email_digest_config',
  'reaction_config',
  'cities',
  'users',
] as const
const progressValidator = v.object({
  generation: v.number(),
  stage: v.number(),
  cursor: v.union(v.string(), v.null()),
})
const summaryValidator = v.object({
  generation: v.number(),
  stage: v.number(),
  status: v.union(v.literal('resetting'), v.literal('ready')),
})
const stepRef = makeFunctionReference<
  'mutation',
  { generation: number; stage: number; cursor: string | null },
  null
>('developmentFixtures:step')

async function assertIsolatedUsers(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  allowed: string[],
) {
  const users = await ctx.db.query('users').take(allowed.length + 1)
  if (
    users.some((user) => !allowed.includes(user.clerkId)) ||
    users.length > allowed.length
  )
    throw new ConvexError(
      'Refusing a database containing users outside the fixture allowlist',
    )
}

export const begin = internalMutation({
  args: {
    identities: fixtureIdentitiesValidator,
    confirmTarget: v.string(),
    requestKey: v.string(),
    reset: v.optional(v.boolean()),
  },
  returns: summaryValidator,
  handler: async (ctx, args) => {
    const { target, allowedClerkIds } = assertDevelopmentFixtureTarget(
      args.confirmTarget,
      args.identities,
    )
    if (!args.requestKey.trim() || args.requestKey.length > 128)
      throw new ConvexError('A bounded idempotency request key is required')
    await assertIsolatedUsers(ctx, allowedClerkIds)
    const previous = await ctx.db.query('development_fixture_state').unique()
    if (previous && previous.target !== target)
      throw new ConvexError('Fixture state belongs to another target')
    if (previous?.requestKey === args.requestKey) {
      if (
        JSON.stringify(previous.identities) !== JSON.stringify(args.identities)
      )
        throw new ConvexError(
          'Request key already belongs to different fixture identities',
        )
      return {
        generation: previous.generation,
        stage: previous.stage,
        status: previous.status,
      }
    }
    if (previous && !args.reset)
      throw new ConvexError(
        'Explicit reset is required to replace existing fixture data',
      )
    if (!previous && !args.reset) {
      for (const table of TABLES)
        if ((await ctx.db.query(table).take(1)).length > 0)
          throw new ConvexError(
            'Explicit reset is required for a nonempty disposable database',
          )
    }
    const progress = {
      generation: (previous?.generation ?? 0) + 1,
      stage: 0,
      cursor: null,
    }
    const data = {
      ...progress,
      status: 'resetting' as const,
      requestKey: args.requestKey,
      target,
      identities: args.identities,
      preparedAt: null,
      manifest: null,
    }
    if (previous) await ctx.db.replace(previous._id, data)
    else await ctx.db.insert('development_fixture_state', data)
    await ctx.scheduler.runAfter(0, stepRef, progress)
    return {
      generation: progress.generation,
      stage: 0,
      status: 'resetting' as const,
    }
  },
})

/** Only the dedicated onboarding persona can be reset; never arbitrary users. */
export const resetOnboarding = internalMutation({
  args: { confirmTarget: v.string(), expectedEmail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.query('development_fixture_state').unique()
    const { allowedClerkIds } = assertDevelopmentFixtureTarget(
      args.confirmTarget,
      current?.identities,
    )
    if (
      !current?.manifest ||
      current.status !== 'ready' ||
      current.target !== args.confirmTarget
    )
      throw new ConvexError('Fixture dataset is not ready')
    await assertIsolatedUsers(ctx, allowedClerkIds)
    const user = await ctx.db.get(current.manifest.onboardingUserId)
    if (
      !user ||
      user.clerkId !== current.identities.onboarding.clerkId ||
      user.email.toLowerCase() !== args.expectedEmail.trim().toLowerCase() ||
      user.email !== current.identities.onboarding.email
    )
      throw new ConvexError(
        'Onboarding fixture email/identity must match exactly',
      )
    if (
      user.deletedAt != null ||
      user.purgedAt != null ||
      user.deactivatedAt != null ||
      user.purgeProgress ||
      (
        await ctx.db
          .query('projects')
          .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
          .take(1)
      ).length > 0
    )
      throw new ConvexError(
        'Onboarding fixture must be active and have no imported projects',
      )
    const next = {
      ...user,
      profile: { ...user.profile, cityId: null },
      exploreConfig: { ...user.exploreConfig, cityIds: [] },
      onboardingCompletedAt: null,
      onboardingSelectedOwnedProjectIds: [],
    }
    await ctx.db.patch(user._id, {
      profile: next.profile,
      exploreConfig: next.exploreConfig,
      onboardingCompletedAt: null,
      onboardingSelectedOwnedProjectIds: [],
      updatedAt: Date.now(),
    })
    await startLifecycleOwnerSync(ctx, user, next)
    return null
  },
})

export const step = internalMutation({
  args: progressValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.query('development_fixture_state').unique()
    if (
      !current ||
      current.status !== 'resetting' ||
      current.generation !== args.generation ||
      current.stage !== args.stage ||
      current.cursor !== args.cursor
    )
      return null
    const { allowedClerkIds } = assertDevelopmentFixtureTarget(
      current.target,
      current.identities,
    )
    await assertIsolatedUsers(ctx, allowedClerkIds)
    const table = TABLES[current.stage]
    if (table) {
      const page = await ctx.db.query(table).paginate({
        cursor: current.cursor,
        numItems: 25,
        maximumRowsRead: 25,
        maximumBytesRead: 128_000,
      })
      for (const row of page.page) await ctx.db.delete(row._id)
      const progress = {
        generation: current.generation,
        stage: current.stage + (page.isDone ? 1 : 0),
        cursor: page.isDone ? null : page.continueCursor,
      }
      await ctx.db.patch(current._id, progress)
      await ctx.scheduler.runAfter(0, stepRef, progress)
    } else {
      const manifest = await installDevelopmentFixtures(ctx, current.identities)
      await ctx.db.patch(current._id, {
        status: 'ready',
        preparedAt: Date.now(),
        manifest,
      })
    }
    return null
  },
})

export const status = internalQuery({
  args: { confirmTarget: v.string() },
  returns: v.union(
    v.object({
      ...summaryValidator.fields,
      preparedAt: v.union(v.number(), v.null()),
      populatedUsername: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    assertDevelopmentFixtureTarget(args.confirmTarget)
    const current = await ctx.db.query('development_fixture_state').unique()
    if (current && current.target !== args.confirmTarget)
      throw new ConvexError('Fixture state belongs to another target')
    return current
      ? {
          generation: current.generation,
          stage: current.stage,
          status: current.status,
          preparedAt: current.preparedAt,
          populatedUsername: current.identities.populated.githubUsername,
        }
      : null
  },
})
