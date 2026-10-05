import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { seedUser } from './__tests__/fixtures.helpers'
import { emailRefs } from './lib/email_function_refs'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

describe('Resend webhook events', () => {
  it('deduplicates events and preserves complaint suppression over later delivery', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'ada' })
    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      if (!user) throw new Error('missing user')
      await ctx.db.patch(userId, {
        notificationPrefs: {
          ...user.notificationPrefs,
          weeklyDigest: true,
        },
        emailSubscription: {
          ...user.emailSubscription!,
          primaryEmailVerified: true,
          preferenceVersion: 1,
        },
      })
    })
    await t.mutation(emailRefs.contacts.ensureForUser, { userId })

    const complained = {
      eventId: 'evt_1',
      eventType: 'email.complained',
      email: 'ada@example.test',
      providerContactId: null,
      providerBroadcastId: null,
      providerEmailId: 'email_1',
      suppression: 'complaint' as const,
    }
    expect(await t.mutation(emailRefs.events.record, complained)).toEqual({
      status: 'processed',
    })
    expect(await t.mutation(emailRefs.events.record, complained)).toEqual({
      status: 'duplicate',
    })
    await t.mutation(emailRefs.events.record, {
      eventId: 'evt_2',
      eventType: 'email.delivered',
      email: 'ada@example.test',
      providerContactId: null,
      providerBroadcastId: null,
      providerEmailId: 'email_1',
    })

    const result = await t.run(async (ctx) => ({
      contact: await ctx.db
        .query('email_contacts')
        .withIndex('by_user', (index) => index.eq('userId', userId))
        .unique(),
      events: await ctx.db
        .query('webhook_events')
        .withIndex('by_source_event', (index) => index.eq('source', 'resend'))
        .collect(),
    }))
    expect(result.contact?.suppression).toBe('complaint')
    expect(result.events).toHaveLength(2)
  })
})
