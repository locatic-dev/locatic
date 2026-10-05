import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fixtureClerkId, seedUser } from './__tests__/fixtures.helpers'
import { campaignContentFingerprint } from './lib/email_campaigns'
import { emailRefs } from './lib/email_function_refs'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const content = {
  subject: 'what builders shipped',
  preheader: 'a fortnight of public work',
  introduction: 'A short look at what the Locatic community shipped.',
  projects: [],
  discussions: [],
  shippingUpdate: '',
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('email campaigns', () => {
  it('rejects anonymous and non-admin callers', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    await seedUser(t, { username: 'ada' })

    await expect(
      t.mutation(emailRefs.campaigns.createDraft, {
        kind: 'announcement',
        title: 'shipping update',
      }),
    ).rejects.toThrow('Unauthorized')
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .mutation(emailRefs.campaigns.createDraft, {
          kind: 'announcement',
          title: 'shipping update',
        }),
    ).rejects.toThrow('Email admin access required')
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .query(emailRefs.campaigns.list, {}),
    ).rejects.toThrow('Email admin access required')
  })

  it('rejects an allowlisted admin whose account is inactive', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const t = convexTest(schema, modules)
    const adminId = await seedUser(t, { username: 'admin' })
    await t.run((ctx) => ctx.db.patch(adminId, { deactivatedAt: Date.now() }))

    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('admin') })
        .mutation(emailRefs.campaigns.createDraft, {
          kind: 'announcement',
          title: 'shipping update',
        }),
    ).rejects.toThrow('Email admin account is inactive')
  })

  it('creates and saves a draft with stale revision protection', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const campaignId = await admin.mutation(emailRefs.campaigns.createDraft, {
      kind: 'digest',
      title: 'fortnightly digest',
    })

    const revision = await admin.mutation(emailRefs.campaigns.saveDraft, {
      campaignId,
      expectedRevision: 1,
      title: 'fortnightly digest',
      content,
    })
    expect(revision).toBe(2)
    await expect(
      admin.mutation(emailRefs.campaigns.saveDraft, {
        campaignId,
        expectedRevision: 1,
        title: 'stale title',
        content,
      }),
    ).rejects.toThrow('Campaign changed')
  })

  it('rejects oversized structured content', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const campaignId = await admin.mutation(emailRefs.campaigns.createDraft, {
      kind: 'announcement',
      title: 'shipping update',
    })

    await expect(
      admin.mutation(emailRefs.campaigns.saveDraft, {
        campaignId,
        expectedRevision: 1,
        title: 'shipping update',
        content: { ...content, subject: 'x'.repeat(141) },
      }),
    ).rejects.toThrow('Subject is too long')
  })

  it('records one send intent when an operator repeats the same request', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    vi.stubEnv('EMAIL_SENDING_ENABLED', 'true')
    const t = convexTest(schema, modules)
    const adminId = await seedUser(t, { username: 'admin' })
    const subscriberId = await seedUser(t, { username: 'reader' })
    const { campaignId, runId } = await t.run(async (ctx) => {
      const subscriber = await ctx.db.get(subscriberId)
      if (!subscriber) throw new Error('subscriber fixture missing')
      await ctx.db.patch(subscriberId, {
        notificationPrefs: {
          ...subscriber.notificationPrefs,
          weeklyDigest: true,
        },
        emailSubscription: {
          primaryEmailVerified: true,
          primaryEmailVerifiedAt: Date.now(),
          preferenceVersion: 1,
          preferenceUpdatedAt: Date.now(),
          preferenceSource: 'settings',
        },
      })
      const contactId = await ctx.db.insert('email_contacts', {
        userId: subscriberId,
        email: subscriber.email,
        normalizedEmail: subscriber.email,
        emailVerified: true,
        desiredSubscribed: true,
        preferenceVersion: 1,
        acknowledgedVersion: 1,
        syncStatus: 'synced',
        providerContactId: 'contact_1',
        syncedEmail: subscriber.email,
        providerUnsubscribed: false,
        suppression: 'none',
        lastError: null,
        lastSyncAttemptedAt: Date.now(),
        lastSyncedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      const now = Date.now()
      const campaignId = await ctx.db.insert('email_campaigns', {
        kind: 'announcement',
        title: 'shipping update',
        periodKey: null,
        periodStart: null,
        periodEnd: null,
        revision: 1,
        templateVersion: 1,
        content: { ...content, subject: 'Shipping update' },
        state: 'review_ready',
        preparationDiagnostics: [],
        createdBy: adminId,
        updatedBy: adminId,
        createdAt: now,
        updatedAt: now,
      })
      const storedCampaign = await ctx.db.get(campaignId)
      if (!storedCampaign) throw new Error('campaign fixture missing')
      const runId = await ctx.db.insert('email_campaign_runs', {
        campaignId,
        campaignRevision: 1,
        requestId: `${campaignId}:1`,
        stage: 'ready',
        subject: 'Shipping update',
        html: '<p>Shipping update</p>',
        text: 'Shipping update',
        contentFingerprint: campaignContentFingerprint(storedCampaign.content),
        sourceFingerprint: '',
        audienceCutoffAt: now,
        audienceSummary: {
          eligible: 1,
          excludedDisabled: 1,
          excludedInactive: 0,
          excludedUnverified: 0,
          excludedSuppressed: 0,
          excludedDuplicate: 0,
          pendingSync: 0,
        },
        approvedBy: adminId,
        approvedAt: now,
        providerBroadcastId: null,
        metrics: {
          sent: 0,
          delivered: 0,
          bounced: 0,
          complained: 0,
          failed: 0,
          suppressed: 0,
        },
        retryCount: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert('email_campaign_recipients', {
        runId,
        contactId,
        normalizedEmail: subscriber.email,
        stateVersion: 1,
        providerContactId: 'contact_1',
        createdAt: now,
      })
      return { campaignId, runId }
    })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const args = { campaignId, reviewedRevision: 1, reviewId: runId }

    const first = await admin.mutation(emailRefs.campaigns.requestSend, args)
    const second = await admin.mutation(emailRefs.campaigns.requestSend, args)
    expect(first).toBe(runId)
    expect(second).toBe(runId)
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('email_campaign_runs')
          .withIndex('by_campaign_revision', (index) =>
            index.eq('campaignId', campaignId).eq('campaignRevision', 1),
          )
          .collect(),
      ),
    ).toHaveLength(1)
  })
})
