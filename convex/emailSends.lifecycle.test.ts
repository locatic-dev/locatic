// Cancelling, stopping, resuming, and account changes during a send.
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import resendTest from '@convex-dev/resend/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  asAdmin,
  campaign,
  componentEmail,
  drain as drainScheduled,
  EMAIL_SEND_TEST_ENV,
  MINUTE,
  seedAdmin,
  seedCampaign,
  seedMembers,
  sends,
  setComponentStatus,
  startDirect,
  stopChain,
  type T,
} from './__tests__/email_sends.helpers'
import { fixtureClerkId, NOW, seedUser } from './__tests__/fixtures.helpers'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { setEmailPreference } from './lib/email_preferences'
import { signUnsubscribeToken } from './lib/unsubscribe_token'
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

describe('cancelling', () => {
  it('stops further batches and cancels waiting emails', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 3)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await stopChain(t)
    // The admin (unverified) and the first member.
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 2,
    })
    await stopChain(t)

    await asAdmin(t).mutation(api.emailCampaigns.cancelSend, { campaignId })
    await drain(t)

    expect((await campaign(t, campaignId))?.state).toBe('cancelled')
    const rows = await sends(t, campaignId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('cancelled')
    expect((await componentEmail(t, rows[0]!.emailId))?.status).toBe(
      'cancelled',
    )

    // Batches that were already scheduled stop at the state check.
    await t.mutation(internal.emailSends.enqueueBatch, { campaignId })
    expect(await sends(t, campaignId)).toHaveLength(1)
  })

  it('leaves emails already handed to Resend alone and never throws', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 2)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const rows = await sends(t, campaignId)
    const own = rows.find((row) => row.userId === member)!
    await setComponentStatus(t, own.emailId, 'sent')

    await t.mutation(internal.emailSends.cancelWaitingSends, {
      userId: member,
    })
    await t.mutation(internal.emailSends.cancelWaitingSends, { campaignId })

    const after = await sends(t, campaignId)
    expect(after.find((row) => row.userId === member)?.status).toBe('queued')
    expect(after.find((row) => row.userId !== member)?.status).toBe('cancelled')
  })

  it('cancels an email already in a component batch that Resend has not accepted', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [row] = await sends(t, campaignId)
    // The component's batch worker picked it up; the batch has not gone yet.
    await setComponentStatus(t, row!.emailId, 'queued')

    await t.mutation(internal.emailSends.cancelWaitingSends, {
      userId: member,
    })

    expect((await sends(t, campaignId))[0]?.status).toBe('cancelled')
    expect((await componentEmail(t, row!.emailId))?.status).toBe('cancelled')
  })

  it.each(['waiting', 'queued', 'sent'] as const)(
    'commits an opt-out whatever the component did with the email (%s)',
    async (componentStatus) => {
      const t = setup()
      const adminId = await seedAdmin(t)
      const [member] = await seedMembers(t, 1)
      const campaignId = await seedCampaign(t, adminId)
      await startDirect(t, campaignId)
      await drain(t)
      const [row] = await sends(t, campaignId)
      if (componentStatus !== 'waiting') {
        await setComponentStatus(t, row!.emailId, componentStatus)
      }

      await t.run((ctx) =>
        setEmailPreference(ctx, {
          userId: member!,
          category: 'product_updates',
          subscribed: false,
          source: 'one_click',
        }),
      )
      await drain(t)

      const user = await t.run((ctx) => ctx.db.get(member!))
      expect(user?.notificationPrefs.productUpdates).toBe(false)
      expect((await sends(t, campaignId))[0]?.status).toBe(
        componentStatus === 'sent' ? 'queued' : 'cancelled',
      )
    },
  )

  it('cancels a member’s waiting emails when they opt out', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)

    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'product_updates',
        subscribed: false,
        source: 'unsubscribe_link',
      }),
    )
    await drain(t)

    expect((await sends(t, campaignId))[0]?.status).toBe('cancelled')
  })

  it('refuses to cancel a draft', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const campaignId = await seedCampaign(t, adminId)
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.cancelSend, { campaignId }),
    ).rejects.toThrow('Only a campaign that is sending can be cancelled')
  })
})

describe('cancellation scope', () => {
  async function seedDigest(t: T, adminId: Id<'users'>) {
    const campaignId = await seedCampaign(t, adminId)
    await t.run((ctx) =>
      ctx.db.patch(campaignId, {
        content: {
          kind: 'digest',
          body: 'Digest',
          cta: null,
          periodKey: 'manual:x',
          periodStart: NOW,
          periodEnd: NOW,
          projects: [],
          discussions: [],
        },
      }),
    )
    return campaignId
  }

  async function bothWaiting(t: T) {
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'weekly_digest',
        subscribed: true,
        source: 'settings',
      }),
    )
    const update = await seedCampaign(t, adminId)
    const digest = await seedDigest(t, adminId)
    await startDirect(t, update)
    await startDirect(t, digest)
    await drain(t)
    return { member: member!, update, digest }
  }

  it('cancels only the category the member turned off', async () => {
    const t = setup()
    const { member, update, digest } = await bothWaiting(t)
    expect((await sends(t, update))[0]?.category).toBe('product_updates')
    expect((await sends(t, digest))[0]?.category).toBe('weekly_digest')

    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      }),
    )
    await drain(t)

    expect((await sends(t, update))[0]?.status).toBe('cancelled')
    expect((await sends(t, digest))[0]?.status).toBe('queued')
  })

  it('cancels both categories on Stop all', async () => {
    const t = setup()
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'secret')
    const { member, update, digest } = await bothWaiting(t)
    const token = await signUnsubscribeToken(member, 'product_updates')

    await t.mutation(api.emailPreferences.stopAllWithToken, { token })
    await drain(t)

    expect((await sends(t, update))[0]?.status).toBe('cancelled')
    expect((await sends(t, digest))[0]?.status).toBe('cancelled')
  })

  it('cancels everything waiting when the account is deactivated', async () => {
    const t = setup()
    const { member, update, digest } = await bothWaiting(t)
    await t.run((ctx) =>
      ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
        userId: member,
        before: Date.now(),
      }),
    )
    await drain(t)

    expect((await sends(t, update))[0]?.status).toBe('cancelled')
    expect((await sends(t, digest))[0]?.status).toBe('cancelled')
  })

  it('leaves sends created after an opt-out was undone alone', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    // Opt out: the cancellation job is scheduled but has not run yet.
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      }),
    )
    vi.setSystemTime(NOW + MINUTE)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'product_updates',
        subscribed: true,
        source: 'settings',
      }),
    )
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await t.mutation(internal.emailSends.enqueueBatch, { campaignId })

    await drain(t)

    expect((await sends(t, campaignId))[0]?.status).toBe('queued')
  })

  it('leaves sends to a new address alone when the old job runs late', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const cyd = await seedUser(t, { username: 'cyd' })
    await t.run((ctx) => ctx.db.patch(cyd, { emailVerified: true }))
    await t.mutation(internal.users.upsertFromClerkWebhook, {
      clerkId: fixtureClerkId('cyd'),
      email: 'cyd@new.example.test',
      githubId: null,
      githubUsername: 'cyd',
      githubUrl: 'https://github.com/cyd',
      displayName: 'cyd',
      avatarUrl: '',
      emailVerified: true,
    })
    vi.setSystemTime(NOW + MINUTE)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await t.mutation(internal.emailSends.enqueueBatch, { campaignId })

    await drain(t)

    const [row] = await sends(t, campaignId)
    expect(row?.userId).toBe(cyd)
    expect(row?.status).toBe('queued')
  })
})

describe('emergency stop', () => {
  it('stops at the next batch when sending is switched off, and resumes once it is back on', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 5)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system
        .query('_scheduled_functions')
        .collect()) {
        if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
      }
    })
    // The admin and two members.
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 3,
    })
    const pendingBatches = async () =>
      (
        await t.run((ctx) =>
          ctx.db.system.query('_scheduled_functions').collect(),
        )
      ).filter(
        (job) =>
          job.state.kind === 'pending' &&
          job.name === 'emailSends:enqueueBatch',
      )
    expect(await pendingBatches()).toHaveLength(1)

    vi.stubEnv('EMAIL_SENDING_ENABLED', '')
    await drain(t)

    expect((await campaign(t, campaignId))?.state).toBe('sending')
    expect(await sends(t, campaignId)).toHaveLength(2)
    expect(await pendingBatches()).toHaveLength(0)
    // Waiting emails are left for the admin to cancel.
    expect(
      (await sends(t, campaignId)).every((row) => row.status === 'queued'),
    ).toBe(true)

    vi.setSystemTime(NOW + 6 * MINUTE)
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.resumeSend, { campaignId }),
    ).rejects.toThrow('Email sending is disabled in this environment')

    vi.stubEnv('EMAIL_SENDING_ENABLED', 'true')
    await asAdmin(t).mutation(api.emailCampaigns.resumeSend, { campaignId })
    await drain(t)

    expect((await campaign(t, campaignId))?.state).toBe('sent')
    expect(await sends(t, campaignId)).toHaveLength(5)
  })
})

describe('resumeSend', () => {
  it('resumes a stalled send from the stored cursor only after five minutes', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 3)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    // The chain died: nothing scheduled.
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system
        .query('_scheduled_functions')
        .collect()) {
        if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
      }
    })

    vi.setSystemTime(NOW + MINUTE)
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.resumeSend, { campaignId }),
    ).rejects.toThrow('Sending is still in progress')

    vi.setSystemTime(NOW + 6 * MINUTE)
    await asAdmin(t).mutation(api.emailCampaigns.resumeSend, { campaignId })
    await drain(t)

    expect(await sends(t, campaignId)).toHaveLength(3)
    expect((await campaign(t, campaignId))?.state).toBe('sent')
  })
})

describe('account changes', () => {
  it('cancels waiting sends on deactivation, deletion and address change', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const ada = await seedUser(t, { username: 'ada' })
    const bob = await seedUser(t, { username: 'bob' })
    const cyd = await seedUser(t, { username: 'cyd' })
    for (const id of [ada, bob, cyd]) {
      await t.run((ctx) => ctx.db.patch(id, { emailVerified: true }))
    }
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    expect(await sends(t, campaignId)).toHaveLength(3)

    await t
      .withIdentity({ subject: fixtureClerkId('ada') })
      .mutation(api.users.deactivateAccount, {})
    await t
      .withIdentity({ subject: fixtureClerkId('bob') })
      .mutation(api.users.deleteAccount, {})
    await t.mutation(internal.users.upsertFromClerkWebhook, {
      clerkId: fixtureClerkId('cyd'),
      email: 'cyd@new.example.test',
      githubId: null,
      githubUsername: 'cyd',
      githubUrl: 'https://github.com/cyd',
      displayName: 'cyd',
      avatarUrl: '',
      emailVerified: true,
    })
    await drain(t)

    const rows = await sends(t, campaignId)
    expect(rows.map((row) => row.status)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ])
  })

  it('deletes a purged member’s send records and consent log', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'weekly_digest',
        subscribed: true,
        source: 'settings',
      }),
    )

    await t.mutation(internal.emailSends.purgeUserEmailRecords, {
      userId: member!,
    })
    await drain(t)

    expect(await sends(t, campaignId)).toEqual([])
    expect(
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect()),
    ).toEqual([])
  })
})
