import resendTest from '@convex-dev/resend/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fixtureClerkId,
  NOW,
  seedUser,
  purgeFixtureAccount,
} from './__tests__/fixtures.helpers'
import type { EmailId } from '@convex-dev/resend'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { signUnsubscribeToken } from './lib/unsubscribe_token'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function setup() {
  const t = convexTest(schema, modules)
  resendTest.register(t)
  return t
}

type TestConvex = ReturnType<typeof setup>

async function insertSend(
  t: TestConvex,
  userId: Id<'users'>,
  status: 'bounced' | 'complained' | 'delivered' | 'failed' | 'cancelled',
  createdAt: number,
) {
  return await t.run(async (ctx) => {
    const campaignId = await ctx.db.insert('email_campaigns', {
      title: 'update',
      subject: 'News',
      preheader: '',
      revision: 1,
      templateVersion: 2,
      state: 'sent',
      content: { kind: 'announcement', body: 'Hello', cta: null },
      preparationDiagnostics: [],
      createdBy: userId,
      updatedBy: userId,
      createdAt,
      updatedAt: createdAt,
    })
    await ctx.db.insert('email_sends', {
      campaignId,
      userId,
      category: 'product_updates',
      emailId: `email_${status}_${createdAt}`,
      status,
      // A complaint is handled when it arrives (emailSends.handleEmailEvent).
      ...(status === 'complained' ? { complaintHandledAt: createdAt } : {}),
      createdAt,
      updatedAt: createdAt,
    })
    return `email_${status}_${createdAt}`
  })
}

async function complain(t: TestConvex, emailId: string) {
  await t.mutation(internal.emailSends.handleEmailEvent, {
    id: emailId as EmailId,
    event: {
      type: 'email.complained',
      created_at: '2026-09-01T12:00:00Z',
      data: {
        created_at: '2026-09-01T12:00:00Z',
        email_id: 'resend_1',
        from: 'Locatic <updates@locatic.test>',
        to: 'ada@example.test',
        subject: 'News',
      },
    },
  })
}

describe('emailPreferences.updateEmailPreference', () => {
  it('writes one category through the single writer with source settings', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })

    await t
      .withIdentity({ subject: fixtureClerkId('ada') })
      .mutation(api.emailPreferences.updateEmailPreference, {
        category: 'product_updates',
        subscribed: false,
      })

    const { user, changes } = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      changes: await ctx.db.query('email_preference_changes').collect(),
    }))
    expect(user?.notificationPrefs.productUpdates).toBe(false)
    expect(changes).toEqual([
      expect.objectContaining({
        userId,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      }),
    ])
  })

  it('requires a signed-in viewer', async () => {
    const t = setup()
    await expect(
      t.mutation(api.emailPreferences.updateEmailPreference, {
        category: 'product_updates',
        subscribed: false,
      }),
    ).rejects.toThrow('Unauthorized')
  })
})

describe('emailPreferences.myEmailStatus', () => {
  it('reports preferences, verification and no block by default', async () => {
    const t = setup()
    await seedUser(t, { username: 'ada' })

    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .query(api.emailPreferences.myEmailStatus, {}),
    ).resolves.toEqual({
      productUpdates: true,
      weeklyDigest: false,
      emailVerified: false,
      blocked: null,
    })
  })

  it('reports a bounce or complaint only after the latest address change', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const viewer = t.withIdentity({ subject: fixtureClerkId('ada') })
    await t.run((ctx) =>
      ctx.db.patch(userId, { emailVerified: true, emailChangedAt: NOW }),
    )

    await insertSend(t, userId, 'bounced', NOW - 1)
    await insertSend(t, userId, 'delivered', NOW + 1)
    expect(
      (await viewer.query(api.emailPreferences.myEmailStatus, {})).blocked,
    ).toBeNull()

    await insertSend(t, userId, 'complained', NOW + 2)
    expect(
      await viewer.query(api.emailPreferences.myEmailStatus, {}),
    ).toMatchObject({ emailVerified: true, blocked: 'complained' })

    // A newer address starts clean.
    await t.run((ctx) => ctx.db.patch(userId, { emailChangedAt: NOW + 3 }))
    expect(
      (await viewer.query(api.emailPreferences.myEmailStatus, {})).blocked,
    ).toBeNull()
  })

  it.each(['failed', 'cancelled'] as const)(
    'reports a complaint that arrived after the send was %s, even after email is turned back on',
    async (status) => {
      const t = setup()
      const userId = await seedUser(t, { username: 'ada' })
      const viewer = t.withIdentity({ subject: fixtureClerkId('ada') })
      await t.run((ctx) => ctx.db.patch(userId, { emailVerified: true }))
      const emailId = await insertSend(t, userId, status, NOW)

      await complain(t, emailId)
      await viewer.mutation(api.emailPreferences.updateEmailPreference, {
        category: 'product_updates',
        subscribed: true,
      })

      expect(
        await viewer.query(api.emailPreferences.myEmailStatus, {}),
      ).toMatchObject({ productUpdates: true, blocked: 'complained' })

      await t.run((ctx) =>
        ctx.db.patch(userId, { emailChangedAt: Date.now() + 1 }),
      )
      expect(
        (await viewer.query(api.emailPreferences.myEmailStatus, {})).blocked,
      ).toBeNull()
    },
  )

  it('requires a signed-in viewer', async () => {
    const t = setup()
    await expect(
      t.query(api.emailPreferences.myEmailStatus, {}),
    ).rejects.toThrow('Unauthorized')
  })
})

describe('token unsubscribe mutations', () => {
  beforeEach(() => vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 's'))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  async function changes(t: TestConvex) {
    return await t.run((ctx) =>
      ctx.db.query('email_preference_changes').collect(),
    )
  }

  it('unsubscribes the token category without signing in', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')

    await expect(
      t.mutation(api.emailPreferences.unsubscribeWithToken, { token }),
    ).resolves.toEqual({ status: 'unsubscribed', category: 'product_updates' })

    const user = await t.run((ctx) => ctx.db.get(userId))
    expect(user?.notificationPrefs.productUpdates).toBe(false)
    expect(await changes(t)).toEqual([
      expect.objectContaining({
        category: 'product_updates',
        subscribed: false,
        source: 'unsubscribe_link',
      }),
    ])
  })

  it('stops every category with the same token', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      await ctx.db.patch(userId, {
        notificationPrefs: { ...user!.notificationPrefs, weeklyDigest: true },
      })
    })
    const token = await signUnsubscribeToken(userId, 'weekly_digest')

    await expect(
      t.mutation(api.emailPreferences.stopAllWithToken, { token }),
    ).resolves.toEqual({ status: 'unsubscribed', category: 'weekly_digest' })

    const user = await t.run((ctx) => ctx.db.get(userId))
    expect(user?.notificationPrefs.productUpdates).toBe(false)
    expect(user?.notificationPrefs.weeklyDigest).toBe(false)
    expect((await changes(t)).map((change) => change.source)).toEqual([
      'unsubscribe_link',
      'unsubscribe_link',
    ])
  })

  it.each(['unsubscribe', 'stopAll', 'oneClick'] as const)(
    'does not recreate consent rows when %s runs after the consent purge stage',
    async (entryPoint) => {
      vi.useFakeTimers({ now: NOW })
      const t = setup()
      const userId = await seedUser(t, { username: 'ada' })
      await t.run(async (ctx) => {
        const user = (await ctx.db.get(userId))!
        await ctx.db.patch(userId, {
          notificationPrefs: { ...user.notificationPrefs, weeklyDigest: true },
          deletedAt: NOW - 31 * 86_400_000,
          deactivatedAt: NOW - 31 * 86_400_000,
          purgeAfter: NOW,
        })
      })
      const token = await signUnsubscribeToken(userId, 'product_updates')
      // Stage 18 follows email_preference_changes. Keep the real multi-page
      // worker paused here so a concurrent old link exercises the race.
      for (let page = 0; page < 100; page++) {
        const user = (await t.run((ctx) => ctx.db.get(userId)))!
        if ((user.purgeProgress?.stage ?? 0) >= 18) break
        await t.mutation(internal.users.scrubDeletedAccount, { userId })
      }
      expect(
        (await t.run((ctx) => ctx.db.get(userId)))?.purgeProgress?.stage,
      ).toBe(18)
      if (entryPoint === 'oneClick') {
        expect(
          await t.mutation(internal.emailPreferences.oneClickUnsubscribe, {
            token,
          }),
        ).toBe(true)
      } else {
        const endpoint =
          entryPoint === 'stopAll'
            ? api.emailPreferences.stopAllWithToken
            : api.emailPreferences.unsubscribeWithToken
        expect(await t.mutation(endpoint, { token })).toMatchObject({
          status: 'unsubscribed',
        })
      }
      await purgeFixtureAccount(t, userId)
      expect((await t.run((ctx) => ctx.db.get(userId)))?.purgedAt).toBe(NOW)
      expect(await changes(t)).toEqual([])
    },
  )

  it('does not write consent after the restoration deadline even before purge starts', async () => {
    vi.useFakeTimers({ now: NOW })
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')
    await t.run((ctx) =>
      ctx.db.patch(userId, {
        deletedAt: NOW - 30 * 86_400_000,
        purgeAfter: NOW,
      }),
    )
    expect(
      await t.mutation(api.emailPreferences.unsubscribeWithToken, { token }),
    ).toMatchObject({ status: 'unsubscribed' })
    expect(await changes(t)).toEqual([])
  })

  it('still records an opt-out while a deleted account can be restored', async () => {
    vi.useFakeTimers({ now: NOW })
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')
    await t.run((ctx) =>
      ctx.db.patch(userId, { deletedAt: NOW, purgeAfter: NOW + 86_400_000 }),
    )
    await t.mutation(api.emailPreferences.unsubscribeWithToken, { token })
    expect(
      (await t.run((ctx) => ctx.db.get(userId)))?.notificationPrefs
        .productUpdates,
    ).toBe(false)
    expect(await changes(t)).toEqual([
      expect.objectContaining({ userId, subscribed: false }),
    ])
  })

  it('answers success but records nothing for a purged account', async () => {
    vi.useFakeTimers()
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const updates = await signUnsubscribeToken(userId, 'product_updates')
    const digest = await signUnsubscribeToken(userId, 'weekly_digest')
    // The real purge, including its scheduled clean-up of email records.
    await purgeFixtureAccount(t, userId)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const tombstone = await t.run((ctx) => ctx.db.get(userId))
    expect(tombstone?.purgedAt).toEqual(expect.any(Number))

    await expect(
      t.mutation(api.emailPreferences.unsubscribeWithToken, { token: updates }),
    ).resolves.toEqual({ status: 'unsubscribed', category: 'product_updates' })
    await expect(
      t.mutation(api.emailPreferences.stopAllWithToken, { token: digest }),
    ).resolves.toEqual({ status: 'unsubscribed', category: 'weekly_digest' })

    await t.finishAllScheduledFunctions(vi.runAllTimers)
    vi.useRealTimers()
    expect(await changes(t)).toEqual([])
    expect(
      (await t.run((ctx) => ctx.db.get(userId)))?.notificationPrefs,
    ).toEqual(tombstone?.notificationPrefs)
  })

  it('reports an invalid token without throwing or changing anything', async () => {
    const t = setup()
    const userId = await seedUser(t, { username: 'ada' })
    const token = await signUnsubscribeToken(userId, 'product_updates')

    for (const bad of ['garbage', `${token}x`, `x${token}`]) {
      await expect(
        t.mutation(api.emailPreferences.unsubscribeWithToken, { token: bad }),
      ).resolves.toEqual({ status: 'invalid' })
      await expect(
        t.mutation(api.emailPreferences.stopAllWithToken, { token: bad }),
      ).resolves.toEqual({ status: 'invalid' })
    }
    expect(await changes(t)).toEqual([])
  })
})
