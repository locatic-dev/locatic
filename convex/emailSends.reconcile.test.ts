// Copying outcomes the component never reports through its callback.
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import resendTest from '@convex-dev/resend/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  drain as drainScheduled,
  EMAIL_SEND_TEST_ENV,
  MINUTE,
  seedAdmin,
  seedCampaign,
  seedMembers,
  sends,
  setComponentStatus,
  startDirect,
  type T,
} from './__tests__/email_sends.helpers'
import { NOW } from './__tests__/fixtures.helpers'
import { components, internal } from './_generated/api'
import { getResend } from './lib/resend'
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

describe('reconcileSends', () => {
  const DAY = 24 * 60 * MINUTE

  it('leaves a sent row as sent when the component no longer has its copy', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [row] = await sends(t, campaignId)
    // Handed to Resend, which suppressed it: no delivery event ever comes.
    await t.run((ctx) => ctx.db.patch(row!._id, { status: 'sent' }))

    vi.setSystemTime(NOW + 20 * MINUTE)
    await t.run((ctx) =>
      ctx.runMutation(components.resend.lib.cleanupAbandonedEmails, {
        olderThan: MINUTE,
      }),
    )
    await t.mutation(internal.emailSends.reconcileSends, {})

    const [after] = await sends(t, campaignId)
    expect(after?.status).toBe('sent')
    expect(after?.errorMessage).toBeUndefined()
  })

  it('no longer touches rows older than the reconciliation window', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 2)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [first, second] = await sends(t, campaignId)
    await t.run((ctx) => ctx.db.patch(second!._id, { status: 'sent' }))
    await setComponentStatus(t, first!.emailId, 'delivered')
    await setComponentStatus(t, second!.emailId, 'delivered')

    vi.setSystemTime(NOW + 26 * DAY)
    await t.mutation(internal.emailSends.reconcileSends, {})

    const after = await sends(t, campaignId)
    expect(
      after.map((row) => [row.status, row.updatedAt, row.nextReconcileAt]),
    ).toEqual([
      ['queued', NOW, undefined],
      ['sent', NOW, undefined],
    ])
  })

  it('schedules a first check 15 minutes after enqueueing', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)

    expect((await sends(t, campaignId))[0]?.nextReconcileAt).toBe(
      NOW + 15 * MINUTE,
    )
  })

  it('visits a newer row behind 500 older unresolved ones within a few runs', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    const sendComponentEmail = (to: string) =>
      t.run((ctx) =>
        getResend().sendEmail(ctx, {
          from: 'Locatic <updates@locatic.test>',
          to,
          subject: 'x',
          html: '<p>x</p>',
        }),
      )
    // 500 handed-over rows that never resolve (one shared component copy).
    const stuck = await sendComponentEmail('stuck@example.test')
    await setComponentStatus(t, stuck, 'sent')
    await t.run(async (ctx) => {
      for (let index = 0; index < 500; index += 1) {
        await ctx.db.insert('email_sends', {
          campaignId,
          userId: member!,
          category: 'product_updates',
          emailId: stuck,
          status: 'sent',
          createdAt: NOW + index,
          updatedAt: NOW + index,
          nextReconcileAt: NOW + index + 15 * MINUTE,
        })
      }
    })
    vi.setSystemTime(NOW + MINUTE)
    const failed = await sendComponentEmail('member0@example.test')
    await setComponentStatus(t, failed, 'failed', 'Resend API error: 422')
    const newer = await t.run((ctx) =>
      ctx.db.insert('email_sends', {
        campaignId,
        userId: member!,
        category: 'product_updates',
        emailId: failed,
        status: 'sent',
        createdAt: NOW + MINUTE,
        updatedAt: NOW + MINUTE,
        nextReconcileAt: NOW + 16 * MINUTE,
      }),
    )

    for (let run = 1; run <= 6; run += 1) {
      vi.setSystemTime(NOW + (15 + run * 15) * MINUTE)
      await t.mutation(internal.emailSends.reconcileSends, {})
    }

    const row = await t.run((ctx) => ctx.db.get(newer))
    expect(row?.status).toBe('failed')
    expect(row?.nextReconcileAt).toBeUndefined()
  })

  it('takes rows off the schedule when they reach a final status', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 3)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [delivered, cancelled, waiting] = await sends(t, campaignId)
    await setComponentStatus(t, delivered!.emailId, 'delivered')
    await t.mutation(internal.emailSends.cancelWaitingSends, {
      userId: cancelled!.userId,
    })

    vi.setSystemTime(NOW + 20 * MINUTE)
    await t.mutation(internal.emailSends.reconcileSends, {})

    const after = await sends(t, campaignId)
    const byId = (id: string) => after.find((row) => row._id === id)
    expect(byId(delivered!._id)).toMatchObject({ status: 'delivered' })
    expect(byId(delivered!._id)?.nextReconcileAt).toBeUndefined()
    expect(byId(cancelled!._id)).toMatchObject({ status: 'cancelled' })
    expect(byId(cancelled!._id)?.nextReconcileAt).toBeUndefined()
    // Still unresolved: checked again in 15 minutes.
    expect(byId(waiting!._id)?.nextReconcileAt).toBe(NOW + 35 * MINUTE)
  })

  it('copies outcomes the component reports without a callback', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 4)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const rows = await sends(t, campaignId)
    await setComponentStatus(
      t,
      rows[0]!.emailId,
      'failed',
      'Resend API error: 422',
    )
    await setComponentStatus(t, rows[1]!.emailId, 'delivered')
    await setComponentStatus(t, rows[2]!.emailId, 'sent')
    // rows[3] stays waiting in the component.

    vi.setSystemTime(NOW + 5 * MINUTE)
    await t.mutation(internal.emailSends.reconcileSends, {})
    expect((await sends(t, campaignId)).map((row) => row.status)).toEqual([
      'queued',
      'queued',
      'queued',
      'queued',
    ])

    vi.setSystemTime(NOW + 20 * MINUTE)
    await t.mutation(internal.emailSends.reconcileSends, {})
    const after = await sends(t, campaignId)
    expect(after.map((row) => row.status)).toEqual([
      'failed',
      'delivered',
      'sent',
      'queued',
    ])
    expect(after[0]?.errorMessage).toBe('Resend API error: 422')
    // Rows it looked at move to the back of the schedule.
    expect(after[3]?.nextReconcileAt).toBe(NOW + 35 * MINUTE)
  })

  it('marks a send failed when the component record is gone', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)

    vi.setSystemTime(NOW + 20 * MINUTE)
    // The component's retention cleanup removed its copy.
    await t.run((ctx) =>
      ctx.runMutation(components.resend.lib.cleanupAbandonedEmails, {
        olderThan: MINUTE,
      }),
    )
    await t.mutation(internal.emailSends.reconcileSends, {})

    expect((await sends(t, campaignId))[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'No delivery record',
    })
  })

  it('keeps reconciling sent rows while many old queued rows remain', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 150)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [handedOver] = await sends(t, campaignId)
    await t.run((ctx) => ctx.db.patch(handedOver!._id, { status: 'sent' }))
    await setComponentStatus(t, handedOver!.emailId, 'delivered')

    // The 149 queued rows stay waiting in the component on every run.
    for (const minutes of [20, 40]) {
      vi.setSystemTime(NOW + minutes * MINUTE)
      await t.mutation(internal.emailSends.reconcileSends, {})
    }

    const after = await sends(t, campaignId)
    expect(after.find((row) => row._id === handedOver!._id)?.status).toBe(
      'delivered',
    )
  })

  it('looks at no more than 100 rows a run', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 101)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)

    vi.setSystemTime(NOW + 20 * MINUTE)
    await t.mutation(internal.emailSends.reconcileSends, {})

    const touched = (await sends(t, campaignId)).filter(
      (row) => row.nextReconcileAt === NOW + 35 * MINUTE,
    )
    expect(touched).toHaveLength(100)
  })
})
