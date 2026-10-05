import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import { fixtureClerkId, seedUser } from './__tests__/fixtures.helpers'
import { emailRefs } from './lib/email_function_refs'
import { summarizeEmailAudience } from './lib/email_contacts'
import { reconcileBroadcastStatus } from './lib/resend_contract'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function notificationPrefs(weeklyDigest: boolean) {
  return {
    projectLikes: true,
    updateLikes: true,
    comments: true,
    commentReplies: true,
    newFollowers: true,
    dms: false,
    weeklyDigest,
    contributorRecognized: true,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Resend contract fixtures', () => {
  it('maps documented statuses and fails closed on unknown values', () => {
    expect(reconcileBroadcastStatus('draft')).toBe('ready')
    expect(reconcileBroadcastStatus('scheduled')).toBe('accepted')
    expect(reconcileBroadcastStatus('queued')).toBe('accepted')
    expect(reconcileBroadcastStatus('sent')).toBe('accepted')
    expect(reconcileBroadcastStatus('canceled')).toBe('cancelled')
    expect(reconcileBroadcastStatus('future_status')).toBe('needs_attention')
    expect(reconcileBroadcastStatus(null)).toBe('needs_attention')
  })
})

describe('email contact eligibility', () => {
  it('preserves the existing false preference and excludes unverified email', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'ada' })

    await t.mutation(emailRefs.contacts.ensureForUser, { userId })

    const state = await t
      .withIdentity({ subject: fixtureClerkId('ada') })
      .query(emailRefs.contacts.myStatus, {})
    expect(state).toMatchObject({
      subscribed: false,
      emailVerified: false,
      syncStatus: 'pending',
    })

    const user = await t.run((ctx) => ctx.db.get(userId))
    expect(user?.notificationPrefs.weeklyDigest).toBe(false)
  })

  it('records a real settings change without letting unrelated changes re-enable email', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'ada' })
    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      if (!user) throw new Error('missing user')
      await ctx.db.patch(userId, {
        emailSubscription: {
          ...user.emailSubscription!,
          primaryEmailVerified: true,
          primaryEmailVerifiedAt: Date.now(),
        },
      })
    })
    const ada = t.withIdentity({ subject: fixtureClerkId('ada') })

    await ada.mutation(api.users.updateNotificationPrefs, {
      ...notificationPrefs(true),
    })
    await ada.mutation(api.users.updateNotificationPrefs, {
      ...notificationPrefs(false),
      comments: false,
    })
    await ada.mutation(api.users.updateNotificationPrefs, {
      ...notificationPrefs(false),
      comments: true,
    })

    const result = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      const contact = await ctx.db
        .query('email_contacts')
        .withIndex('by_user', (index) => index.eq('userId', userId))
        .unique()
      return { user, contact }
    })
    expect(result.user?.notificationPrefs.weeklyDigest).toBe(false)
    expect(result.user?.emailSubscription?.preferenceVersion).toBe(2)
    expect(result.contact).toMatchObject({
      desiredSubscribed: false,
      emailVerified: true,
      preferenceVersion: 2,
      syncStatus: 'pending',
    })
  })

  it('applies provider unsubscribe as a local opt-out and never clears suppression', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'ada' })
    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      if (!user) throw new Error('missing user')
      await ctx.db.patch(userId, {
        notificationPrefs: notificationPrefs(true),
        emailSubscription: {
          ...user.emailSubscription!,
          primaryEmailVerified: true,
          preferenceVersion: 1,
        },
      })
    })
    await t.mutation(emailRefs.contacts.ensureForUser, { userId })

    await t.mutation(emailRefs.contacts.applyProviderState, {
      eventId: 'evt_unsubscribe',
      email: 'ada@example.test',
      providerContactId: 'contact_1',
      providerUnsubscribed: true,
      suppression: 'complaint',
    })
    await t.mutation(emailRefs.contacts.applyProviderState, {
      eventId: 'evt_late_update',
      email: 'ada@example.test',
      providerContactId: 'contact_1',
      providerUnsubscribed: false,
    })
    await t.mutation(emailRefs.contacts.ensureForUser, { userId })

    const result = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      contact: await ctx.db
        .query('email_contacts')
        .withIndex('by_user', (index) => index.eq('userId', userId))
        .unique(),
    }))
    expect(result.user?.notificationPrefs.weeklyDigest).toBe(false)
    expect(result.contact?.suppression).toBe('complaint')
    expect(result.contact?.desiredSubscribed).toBe(false)
  })

  it('retains the old provider identity until an email change can revoke its membership', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'ada' })
    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      if (!user) throw new Error('missing user')
      await ctx.db.patch(userId, {
        notificationPrefs: notificationPrefs(true),
        emailSubscription: {
          ...user.emailSubscription!,
          primaryEmailVerified: true,
          preferenceVersion: 1,
        },
      })
    })
    await t.mutation(emailRefs.contacts.ensureForUser, { userId })
    await t.run(async (ctx) => {
      const [user, contact] = await Promise.all([
        ctx.db.get(userId),
        ctx.db
          .query('email_contacts')
          .withIndex('by_user', (index) => index.eq('userId', userId))
          .unique(),
      ])
      if (!user || !contact) throw new Error('contact fixture missing')
      await ctx.db.patch(contact._id, {
        providerContactId: 'old_contact',
        syncedEmail: 'ada@example.test',
        acknowledgedVersion: 1,
        syncStatus: 'synced',
      })
      await ctx.db.patch(userId, {
        email: 'ada.new@example.test',
        emailSubscription: {
          ...user.emailSubscription!,
          preferenceVersion: 2,
        },
      })
    })
    await t.mutation(emailRefs.contacts.ensureForUser, { userId })

    const contact = await t.run((ctx) =>
      ctx.db
        .query('email_contacts')
        .withIndex('by_user', (index) => index.eq('userId', userId))
        .unique(),
    )
    expect(contact).toMatchObject({
      normalizedEmail: 'ada.new@example.test',
      providerContactId: 'old_contact',
      syncedEmail: 'ada@example.test',
      syncStatus: 'pending',
    })
  })

  it('keeps every duplicate address out of provider membership until the conflict is resolved', async () => {
    const t = convexTest(schema, modules)
    const firstId = await seedUser(t, { username: 'ada' })
    const secondId = await seedUser(t, { username: 'grace' })
    await t.run(async (ctx) => {
      for (const userId of [firstId, secondId]) {
        const user = await ctx.db.get(userId)
        if (!user) throw new Error('missing user')
        await ctx.db.patch(userId, {
          email: 'shared@example.test',
          notificationPrefs: notificationPrefs(true),
          emailSubscription: {
            ...user.emailSubscription!,
            primaryEmailVerified: true,
            preferenceVersion: 1,
          },
        })
      }
    })
    await t.mutation(emailRefs.contacts.ensureForUser, { userId: firstId })
    await t.mutation(emailRefs.contacts.ensureForUser, { userId: secondId })

    const duplicated = await t.run((ctx) =>
      ctx.db
        .query('email_contacts')
        .withIndex('by_normalized_email', (index) =>
          index.eq('normalizedEmail', 'shared@example.test'),
        )
        .collect(),
    )
    expect(duplicated).toHaveLength(2)
    expect(duplicated.every((contact) => !contact.desiredSubscribed)).toBe(true)

    await t.run(async (ctx) => {
      await ctx.db.patch(secondId, { email: 'grace.new@example.test' })
    })
    await t.mutation(emailRefs.contacts.ensureForUser, { userId: secondId })
    const first = await t.run((ctx) =>
      ctx.db
        .query('email_contacts')
        .withIndex('by_user', (index) => index.eq('userId', firstId))
        .unique(),
    )
    expect(first).toMatchObject({
      desiredSubscribed: true,
      syncStatus: 'pending',
    })
  })

  it('claims a due retry even when permanent failures are older', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'retry-reader' })
    const now = Date.now()
    const dueContactId = await t.run(async (ctx) => {
      const base = {
        userId,
        emailVerified: true,
        desiredSubscribed: true,
        preferenceVersion: 1,
        acknowledgedVersion: 0,
        stateVersion: 1,
        acknowledgedStateVersion: 0,
        claimToken: null,
        claimExpiresAt: null,
        retryCount: 1,
        providerContactId: null,
        syncedEmail: null,
        providerUnsubscribed: false,
        providerOptOutPreferenceVersion: null,
        allowProviderResubscribe: false,
        suppression: 'none' as const,
        lastSyncAttemptedAt: now - 10_000,
        lastSyncedAt: null,
        createdAt: now - 10_000,
      }
      for (let index = 0; index < 4; index += 1) {
        await ctx.db.insert('email_contacts', {
          ...base,
          email: `permanent-${index}@example.test`,
          normalizedEmail: `permanent-${index}@example.test`,
          syncStatus: 'failed',
          nextRetryAt: null,
          lastError: 'invalid_api_key',
          updatedAt: now - 9_000 + index,
        })
      }
      return await ctx.db.insert('email_contacts', {
        ...base,
        email: 'due@example.test',
        normalizedEmail: 'due@example.test',
        syncStatus: 'failed',
        nextRetryAt: now - 1,
        lastError: 'rate_limit_exceeded',
        updatedAt: now - 1_000,
      })
    })

    const claimed = await t.mutation(emailRefs.contacts.claimPending, {
      limit: 2,
      now,
    })

    expect(claimed.map((contact) => contact.contactId)).toContain(dueContactId)
  })

  it('does not claim a failed contact before its retry is due', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'future-retry-reader' })
    const now = Date.now()
    const contactId = await t.run((ctx) =>
      ctx.db.insert('email_contacts', {
        userId,
        email: 'future-retry@example.test',
        normalizedEmail: 'future-retry@example.test',
        emailVerified: true,
        desiredSubscribed: true,
        preferenceVersion: 1,
        acknowledgedVersion: 0,
        stateVersion: 1,
        acknowledgedStateVersion: 0,
        syncStatus: 'failed',
        claimToken: null,
        claimExpiresAt: null,
        retryCount: 1,
        nextRetryAt: now + 60_000,
        providerContactId: null,
        syncedEmail: null,
        providerUnsubscribed: false,
        providerOptOutPreferenceVersion: null,
        allowProviderResubscribe: false,
        suppression: 'none',
        lastError: 'rate_limit_exceeded',
        lastSyncAttemptedAt: now,
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    )

    const claimed = await t.mutation(emailRefs.contacts.claimPending, {
      limit: 2,
      now,
    })

    expect(claimed.map((contact) => contact.contactId)).not.toContain(contactId)
  })

  it('moves active claims out of the pending queue so later rows make progress', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'queue-reader' })
    const now = Date.now()
    const ids = await t.run(async (ctx) => {
      const inserted = []
      for (let index = 0; index < 6; index += 1) {
        inserted.push(
          await ctx.db.insert('email_contacts', {
            userId,
            email: `pending-${index}@example.test`,
            normalizedEmail: `pending-${index}@example.test`,
            emailVerified: true,
            desiredSubscribed: true,
            preferenceVersion: 1,
            acknowledgedVersion: 0,
            stateVersion: 1,
            acknowledgedStateVersion: 0,
            syncStatus: 'pending',
            claimToken: null,
            claimExpiresAt: null,
            retryCount: 0,
            nextRetryAt: null,
            providerContactId: null,
            syncedEmail: null,
            providerUnsubscribed: false,
            providerOptOutPreferenceVersion: null,
            allowProviderResubscribe: false,
            suppression: 'none',
            lastError: null,
            lastSyncAttemptedAt: null,
            lastSyncedAt: null,
            createdAt: now + index,
            updatedAt: now + index,
          }),
        )
      }
      return inserted
    })

    const first = await t.mutation(emailRefs.contacts.claimPending, {
      limit: 2,
      now,
    })
    const second = await t.mutation(emailRefs.contacts.claimPending, {
      limit: 2,
      now,
    })

    expect(first.map((contact) => contact.contactId)).toEqual(ids.slice(0, 2))
    expect(second.map((contact) => contact.contactId)).toEqual(ids.slice(2, 4))
  })

  it('lets an admin requeue permanent failures without clearing suppression', async () => {
    const t = convexTest(schema, modules)
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    await seedUser(t, { username: 'admin' })
    const userId = await seedUser(t, { username: 'retry-target' })
    const contactId = await t.run((ctx) =>
      ctx.db.insert('email_contacts', {
        userId,
        email: 'retry-target@example.test',
        normalizedEmail: 'retry-target@example.test',
        emailVerified: true,
        desiredSubscribed: false,
        preferenceVersion: 1,
        acknowledgedVersion: 0,
        stateVersion: 1,
        acknowledgedStateVersion: 0,
        syncStatus: 'failed',
        claimToken: null,
        claimExpiresAt: null,
        retryCount: 6,
        nextRetryAt: null,
        providerContactId: 'provider_retry',
        syncedEmail: 'retry-target@example.test',
        providerUnsubscribed: true,
        providerOptOutPreferenceVersion: 1,
        allowProviderResubscribe: false,
        suppression: 'provider_unsubscribed',
        lastError: 'invalid_api_key',
        lastSyncAttemptedAt: Date.now(),
        lastSyncedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    )

    await t
      .withIdentity({ subject: fixtureClerkId('admin') })
      .mutation(emailRefs.contacts.retryFailed, { limit: 10 })

    const contact = await t.run((ctx) => ctx.db.get(contactId))
    expect(contact).toMatchObject({
      syncStatus: 'pending',
      providerUnsubscribed: true,
      suppression: 'provider_unsubscribed',
      acknowledgedStateVersion: 0,
    })
  })

  it('enforces the documented 500-total-contact launch boundary', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'audience-boundary' })
    const now = Date.now()
    await t.run(async (ctx) => {
      for (let index = 0; index < 500; index += 1) {
        await ctx.db.insert('email_contacts', {
          userId,
          email: `boundary-${index}@example.test`,
          normalizedEmail: `boundary-${index}@example.test`,
          emailVerified: true,
          desiredSubscribed: false,
          preferenceVersion: 0,
          acknowledgedVersion: 0,
          stateVersion: 1,
          acknowledgedStateVersion: 1,
          syncStatus: 'synced',
          claimToken: null,
          claimExpiresAt: null,
          retryCount: 0,
          nextRetryAt: null,
          providerContactId: null,
          syncedEmail: null,
          providerUnsubscribed: false,
          providerOptOutPreferenceVersion: null,
          allowProviderResubscribe: false,
          suppression: 'none',
          lastError: null,
          lastSyncAttemptedAt: now,
          lastSyncedAt: now,
          createdAt: now + index,
          updatedAt: now + index,
        })
      }
    })

    await expect(
      t.run((ctx) => summarizeEmailAudience(ctx)),
    ).resolves.toMatchObject({ eligible: 0, excludedDisabled: 500 })
    await t.run((ctx) =>
      ctx.db.insert('email_contacts', {
        userId,
        email: 'boundary-overflow@example.test',
        normalizedEmail: 'boundary-overflow@example.test',
        emailVerified: true,
        desiredSubscribed: false,
        preferenceVersion: 0,
        acknowledgedVersion: 0,
        stateVersion: 1,
        acknowledgedStateVersion: 1,
        syncStatus: 'synced',
        claimToken: null,
        claimExpiresAt: null,
        retryCount: 0,
        nextRetryAt: null,
        providerContactId: null,
        syncedEmail: null,
        providerUnsubscribed: false,
        providerOptOutPreferenceVersion: null,
        allowProviderResubscribe: false,
        suppression: 'none',
        lastError: null,
        lastSyncAttemptedAt: now,
        lastSyncedAt: now,
        createdAt: now + 501,
        updatedAt: now + 501,
      }),
    )
    await expect(t.run((ctx) => summarizeEmailAudience(ctx))).rejects.toThrow(
      'Audience exceeds the 500-contact reviewed delivery limit',
    )
  })
})
