// Delivery events from Resend and complaint handling.
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import resendTest from '@convex-dev/resend/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailId } from '@convex-dev/resend'

import {
  drain as drainScheduled,
  EMAIL_SEND_TEST_ENV,
  emailEvent,
  MINUTE,
  seedAdmin,
  seedCampaign,
  seedMembers,
  sends,
  startDirect,
  type T,
} from './__tests__/email_sends.helpers'
import { NOW } from './__tests__/fixtures.helpers'
import { api, internal } from './_generated/api'
import { setEmailPreference } from './lib/email_preferences'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function setup() {
  const t = convexTest(schema, modules)
  resendTest.register(t)
  rateLimiterTest.register(t)
  return t
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  for (const [name, value] of Object.entries(EMAIL_SEND_TEST_ENV)) {
    vi.stubEnv(name, value)
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const drain = (t: T) => drainScheduled(t, vi)

describe('handleEmailEvent', () => {
  async function sentTo(t: T) {
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [row] = await sends(t, campaignId)
    return { member: member!, row: row!, campaignId }
  }

  async function deliver(
    t: T,
    emailId: string,
    type: Parameters<typeof emailEvent>[0],
  ) {
    await t.mutation(internal.emailSends.handleEmailEvent, {
      id: emailId as EmailId,
      event: emailEvent(type),
    })
  }

  it('moves status forward only', async () => {
    const t = setup()
    const { row, campaignId } = await sentTo(t)

    await deliver(t, row.emailId, 'email.delivered')
    await deliver(t, row.emailId, 'email.sent')
    expect((await sends(t, campaignId))[0]?.status).toBe('delivered')

    for (const type of [
      'email.opened',
      'email.clicked',
      'email.delivery_delayed',
    ] as const) {
      await deliver(t, row.emailId, type)
    }
    expect((await sends(t, campaignId))[0]?.status).toBe('delivered')

    await deliver(t, row.emailId, 'email.bounced')
    const [bounced] = await sends(t, campaignId)
    expect(bounced?.status).toBe('bounced')
    expect(bounced?.errorMessage).toBe('Mailbox does not exist')
  })

  it('turns every preference off once on a complaint', async () => {
    const t = setup()
    const { member, row, campaignId } = await sentTo(t)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member,
        category: 'weekly_digest',
        subscribed: true,
        source: 'settings',
      }),
    )

    await deliver(t, row.emailId, 'email.complained')
    await deliver(t, row.emailId, 'email.complained')
    await deliver(t, row.emailId, 'email.delivered')
    await drain(t)

    expect((await sends(t, campaignId))[0]?.status).toBe('complained')
    const user = await t.run((ctx) => ctx.db.get(member))
    expect(user?.notificationPrefs.productUpdates).toBe(false)
    expect(user?.notificationPrefs.weeklyDigest).toBe(false)
    const complaints = (
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect())
    ).filter((change) => change.source === 'complaint')
    expect(complaints.map((change) => change.category).sort()).toEqual([
      'product_updates',
      'weekly_digest',
    ])
  })

  it.each(['email.bounced', 'email.failed'] as const)(
    'still turns preferences off for a complaint after %s',
    async (first) => {
      const t = setup()
      const { member, row, campaignId } = await sentTo(t)

      await deliver(t, row.emailId, first)
      await deliver(t, row.emailId, 'email.complained')
      await drain(t)

      const [after] = await sends(t, campaignId)
      // The display status stays at the first terminal outcome.
      expect(after?.status).toBe(
        first === 'email.bounced' ? 'bounced' : 'failed',
      )
      expect(after?.complaintHandledAt).toEqual(expect.any(Number))
      const user = await t.run((ctx) => ctx.db.get(member))
      expect(user?.notificationPrefs.productUpdates).toBe(false)
    },
  )

  it('ignores a repeated complaint after the member turned email back on', async () => {
    const t = setup()
    const { member, row } = await sentTo(t)

    await deliver(t, row.emailId, 'email.complained')
    await drain(t)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member,
        category: 'product_updates',
        subscribed: true,
        source: 'settings',
      }),
    )
    await deliver(t, row.emailId, 'email.complained')
    await drain(t)

    const user = await t.run((ctx) => ctx.db.get(member))
    expect(user?.notificationPrefs.productUpdates).toBe(true)
    const complaints = (
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect())
    ).filter((change) => change.source === 'complaint')
    expect(complaints).toHaveLength(1)
  })

  it('records a complaint about an earlier address without turning email off for the new one', async () => {
    const t = setup()
    const { member, row, campaignId } = await sentTo(t)
    await deliver(t, row.emailId, 'email.delivered')
    const user = await t.run((ctx) => ctx.db.get(member))
    // The member moves to a new, verified address after the send.
    vi.setSystemTime(NOW + MINUTE)
    await t.mutation(internal.users.upsertFromClerkWebhook, {
      clerkId: user!.clerkId,
      email: 'member0@new.example.test',
      githubId: null,
      githubUsername: user!.github.username,
      githubUrl: `https://github.com/${user!.github.username}`,
      displayName: user!.profile.displayName,
      avatarUrl: '',
      emailVerified: true,
    })

    vi.setSystemTime(NOW + 2 * MINUTE)
    await deliver(t, row.emailId, 'email.complained')
    await drain(t)

    const [after] = await sends(t, campaignId)
    expect(after?.status).toBe('complained')
    expect(after?.complaintHandledAt).toBe(NOW + 2 * MINUTE)
    const current = await t.run((ctx) => ctx.db.get(member))
    expect(current?.notificationPrefs.productUpdates).toBe(true)
    expect(
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect()),
    ).toEqual([])
    const status = await t
      .withIdentity({ subject: user!.clerkId })
      .query(api.emailPreferences.myEmailStatus, {})
    expect(status.blocked).toBeNull()
  })

  it('ignores emails without a send row, such as test sends', async () => {
    const t = setup()
    await expect(
      t.mutation(internal.emailSends.handleEmailEvent, {
        id: 'unknown_email' as EmailId,
        event: emailEvent('email.complained'),
      }),
    ).resolves.toBeNull()
  })
})
