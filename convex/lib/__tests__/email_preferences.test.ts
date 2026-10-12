import resendTest from '@convex-dev/resend/test'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { seedUser } from '../../__tests__/fixtures.helpers'
import type { Id } from '../../_generated/dataModel'
import schema from '../../schema'
import { setEmailPreference } from '../email_preferences'

const modules = import.meta.glob('../../**/*.ts')

function setup() {
  const t = convexTest(schema, modules)
  resendTest.register(t)
  return t
}

async function state(t: ReturnType<typeof setup>, userId: Id<'users'>) {
  return await t.run(async (ctx) => ({
    user: await ctx.db.get(userId),
    changes: await ctx.db
      .query('email_preference_changes')
      .withIndex('by_user_and_changed_at', (q) => q.eq('userId', userId))
      .collect(),
    scheduled: (await ctx.db.system.query('_scheduled_functions').collect())
      .filter((job) => job.state.kind === 'pending')
      .map((job) => ({ name: job.name, args: job.args })),
  }))
}

describe('setEmailPreference', () => {
  it('unsubscribes one category, logs it and schedules cancellation', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const before = await state(t, userId)

    const result = await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      }),
    )

    const after = await state(t, userId)
    expect(result).toEqual({ changed: true })
    expect(after.user?.notificationPrefs).toEqual({
      ...before.user?.notificationPrefs,
      productUpdates: false,
    })
    expect(after.changes).toEqual([
      expect.objectContaining({
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      }),
    ])
    expect(after.scheduled).toEqual([
      {
        name: 'emailSends:cancelWaitingSends',
        args: [
          { userId, category: 'product_updates', before: expect.any(Number) },
        ],
      },
    ])
  })

  it('does nothing when the value is already set', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })

    const result = await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId,
        category: 'weekly_digest',
        subscribed: false,
        source: 'unsubscribe_link',
      }),
    )

    const after = await state(t, userId)
    expect(result).toEqual({ changed: false })
    expect(after.changes).toEqual([])
    expect(after.scheduled).toEqual([])
  })

  it('logs a subscription without scheduling cancellation', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })

    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId,
        category: 'weekly_digest',
        subscribed: true,
        source: 'settings',
      }),
    )

    const after = await state(t, userId)
    expect(after.user?.notificationPrefs.weeklyDigest).toBe(true)
    expect(after.changes).toHaveLength(1)
    expect(after.scheduled).toEqual([])
  })

  it('reports no change for an unknown user', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    await t.run((ctx) => ctx.db.delete(userId))

    await expect(
      t.run((ctx) =>
        setEmailPreference(ctx, {
          userId,
          category: 'product_updates',
          subscribed: false,
          source: 'one_click',
        }),
      ),
    ).resolves.toEqual({ changed: false })
  })
})
