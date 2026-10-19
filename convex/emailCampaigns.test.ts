import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BENGALURU,
  DAY_MS,
  fixtureClerkId,
  NOW,
  seedCity,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { createDefaultViewerProfile } from './lib/viewer'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const draft = {
  subject: 'what builders shipped',
  preheader: 'a fortnight of public work',
  content: {
    kind: 'announcement' as const,
    body: 'A short look at what the Locatic community shipped.',
    cta: null,
  },
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
      t.mutation(api.emailCampaigns.createDraft, {
        kind: 'announcement',
        title: 'shipping update',
      }),
    ).rejects.toThrow('Unauthorized')
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .mutation(api.emailCampaigns.createDraft, {
          kind: 'announcement',
          title: 'shipping update',
        }),
    ).rejects.toThrow('Email admin access required')
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .query(api.emailCampaigns.list, {}),
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
        .mutation(api.emailCampaigns.createDraft, {
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
    const campaignId = await admin.mutation(api.emailCampaigns.createDraft, {
      kind: 'announcement',
      title: 'shipping update',
    })

    const revision = await admin.mutation(api.emailCampaigns.saveDraft, {
      campaignId,
      expectedRevision: 1,
      title: 'shipping update',
      ...draft,
    })
    expect(revision).toBe(2)
    await expect(
      admin.mutation(api.emailCampaigns.saveDraft, {
        campaignId,
        expectedRevision: 1,
        title: 'stale title',
        ...draft,
      }),
    ).rejects.toThrow('Campaign changed')
  })

  it('rejects oversized structured content', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const campaignId = await admin.mutation(api.emailCampaigns.createDraft, {
      kind: 'announcement',
      title: 'shipping update',
    })

    await expect(
      admin.mutation(api.emailCampaigns.saveDraft, {
        campaignId,
        expectedRevision: 1,
        title: 'shipping update',
        ...draft,
        subject: 'x'.repeat(141),
      }),
    ).rejects.toThrow('Subject is too long')
  })

  it('edits only drafts and never changes the campaign kind', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const campaignId = await admin.mutation(api.emailCampaigns.createDraft, {
      kind: 'announcement',
      title: 'shipping update',
    })

    await expect(
      admin.mutation(api.emailCampaigns.saveDraft, {
        campaignId,
        expectedRevision: 1,
        title: 'shipping update',
        subject: 'News',
        preheader: '',
        content: {
          kind: 'digest',
          body: 'Hello',
          cta: null,
          periodKey: 'manual:x',
          periodStart: 0,
          periodEnd: 0,
          projects: [],
          discussions: [],
        },
      }),
    ).rejects.toThrow('Campaign type cannot change')

    await t.run((ctx) => ctx.db.patch(campaignId, { state: 'sending' }))
    await expect(
      admin.mutation(api.emailCampaigns.saveDraft, {
        campaignId,
        expectedRevision: 1,
        title: 'shipping update',
        ...draft,
      }),
    ).rejects.toThrow('Campaign can only be edited as a draft')
  })

  it('creates digests with a manual period and empty selections', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    vi.stubEnv('EMAIL_SENDING_ENABLED', '')
    vi.stubEnv('EMAIL_TEST_SENDING_ENABLED', '')
    vi.stubEnv('EMAIL_TEST_RECIPIENTS', '')
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const campaignId = await admin.mutation(api.emailCampaigns.createDraft, {
      kind: 'digest',
      title: 'hand-made digest',
    })

    let campaign = await admin.query(api.emailCampaigns.get, { campaignId })
    expect(campaign?.content).toMatchObject({
      kind: 'digest',
      body: '',
      cta: null,
      periodKey: expect.stringMatching(/^manual:/),
      projects: [],
      discussions: [],
    })
    expect(campaign?.state).toBe('draft')
    expect(campaign).toMatchObject({
      sendingEnabled: false,
      testSendingEnabled: false,
      testRecipients: [],
      defaultTestRecipient: null,
      sending: null,
      results: null,
    })

    vi.stubEnv('EMAIL_TEST_RECIPIENTS', 'ADMIN@example.test,qa@example.test')
    campaign = await admin.query(api.emailCampaigns.get, { campaignId })
    expect(campaign?.testRecipients).toEqual([
      'ADMIN@example.test',
      'qa@example.test',
    ])
    expect(campaign?.defaultTestRecipient).toBe('admin@example.test')
  })
})

async function setPrefs(
  t: TestConvex<typeof schema>,
  userId: Id<'users'>,
  patch: {
    emailVerified?: boolean
    productUpdates?: boolean
    weeklyDigest?: boolean
    deactivatedAt?: number
  },
) {
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId)
    if (!user) throw new Error('missing fixture user')
    await ctx.db.patch(userId, {
      ...(patch.emailVerified === undefined
        ? {}
        : { emailVerified: patch.emailVerified }),
      ...(patch.deactivatedAt === undefined
        ? {}
        : { deactivatedAt: patch.deactivatedAt }),
      notificationPrefs: {
        ...user.notificationPrefs,
        ...(patch.productUpdates === undefined
          ? {}
          : { productUpdates: patch.productUpdates }),
        ...(patch.weeklyDigest === undefined
          ? {}
          : { weeklyDigest: patch.weeklyDigest }),
      },
    })
  })
}

describe('email campaign preview', () => {
  it('renders unsaved content for admins and echoes the request number', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    vi.stubEnv('SITE_URL', 'https://locatic.test')
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    await seedUser(t, { username: 'ada' })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const args = {
      requestId: 7,
      subject: 'Maps are live',
      preheader: '',
      content: {
        kind: 'announcement' as const,
        body: 'Hello **builders**',
        cta: null,
      },
    }

    const preview = await admin.action(api.emailRender.previewCampaign, args)
    expect(preview.requestId).toBe(7)
    expect(preview.html).toContain('<strong>builders</strong>')
    expect(preview.html).toContain('https://locatic.test/settings')

    await expect(
      admin.action(api.emailRender.previewCampaign, {
        ...args,
        subject: 'x'.repeat(141),
      }),
    ).rejects.toThrow('Subject is too long')
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .action(api.emailRender.previewCampaign, args),
    ).rejects.toThrow('Email admin access required')
  })

  it('estimates the audience with a sample and skipped counts', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    const ada = await seedUser(t, { username: 'ada', displayName: 'Ada L' })
    const bob = await seedUser(t, { username: 'bob' })
    const carol = await seedUser(t, { username: 'carol' })
    await seedUser(t, { username: 'dan' })
    const eve = await seedUser(t, { username: 'eve' })
    await setPrefs(t, ada, { emailVerified: true })
    await setPrefs(t, bob, { emailVerified: true, weeklyDigest: true })
    await setPrefs(t, carol, { emailVerified: true, productUpdates: false })
    await setPrefs(t, eve, { emailVerified: true, deactivatedAt: 1 })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const announcement = await admin.mutation(api.emailCampaigns.createDraft, {
      kind: 'announcement',
      title: 'update',
    })
    const digest = await admin.mutation(api.emailCampaigns.createDraft, {
      kind: 'digest',
      title: 'digest',
    })

    await expect(
      admin.query(api.emailCampaigns.getSendPreview, {
        campaignId: announcement,
      }),
    ).resolves.toEqual({
      estimatedCount: 2,
      capped: false,
      sample: [
        { displayName: 'Ada L', githubUsername: 'ada' },
        { displayName: 'bob', githubUsername: 'bob' },
      ],
      skipped: { unsubscribed: 1, unverified: 2, inactive: 1 },
    })
    await expect(
      admin.query(api.emailCampaigns.getSendPreview, { campaignId: digest }),
    ).resolves.toMatchObject({
      estimatedCount: 1,
      sample: [{ displayName: 'bob', githubUsername: 'bob' }],
      skipped: { unsubscribed: 2, unverified: 2, inactive: 1 },
    })
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .query(api.emailCampaigns.getSendPreview, { campaignId: digest }),
    ).rejects.toThrow('Email admin access required')
  })

  it('estimates from at most the first 100 members', async () => {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('users', {
          ...createDefaultViewerProfile({
            clerkId: `bulk_${index}`,
            email: `bulk${index}@example.test`,
            githubId: index,
            githubUsername: `bulk${index}`,
            githubUrl: `https://github.com/bulk${index}`,
            avatarUrl: '',
            displayName: `bulk ${index}`,
          }),
          emailVerified: true,
        })
      }
    })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    const campaignId = await admin.mutation(api.emailCampaigns.createDraft, {
      kind: 'announcement',
      title: 'update',
    })

    const preview = await admin.query(api.emailCampaigns.getSendPreview, {
      campaignId,
    })
    // The admin (unverified) and 99 members fill the first 100.
    expect(preview.capped).toBe(true)
    expect(preview.estimatedCount).toBe(99)
    expect(preview.skipped.unverified).toBe(1)
    expect(preview.sample).toHaveLength(5)
  })
})

describe('email campaign project search', () => {
  async function setupSearch() {
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    vi.stubEnv('SITE_URL', 'https://locatic.test')
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'admin' })
    // Explore eligibility needs an owner with a profile city.
    const cityId = await seedCity(t, BENGALURU)
    const ownerId = await seedUser(t, { username: 'ada', cityId })
    const mapkit = await seedProject(t, {
      ownerId,
      name: 'mapkit',
      addedAt: NOW - 400 * DAY_MS,
    })
    for (let index = 0; index < 80; index += 1) {
      await seedProject(t, {
        ownerId,
        name: `newer-${index}`,
        addedAt: NOW - index * 1_000,
      })
    }
    const hidden = await seedProject(t, {
      ownerId,
      name: 'mapkit-private',
      isVisible: false,
    })
    return {
      t,
      mapkit,
      hidden,
      admin: t.withIdentity({ subject: fixtureClerkId('admin') }),
    }
  }

  it('finds an older project by name behind many newer ones', async () => {
    const { admin, mapkit } = await setupSearch()

    const results = await admin.query(api.emailCampaigns.searchProjects, {
      query: 'mapkit',
    })
    expect(results.map((project) => project.projectId)).toEqual([mapkit])
  })

  it.each([
    'ada/mapkit',
    'Ada/MapKit',
    'https://github.com/ada/mapkit',
    'https://locatic.test/project/ada/mapkit',
  ])('ranks an exact match for %s first', async (query) => {
    const { admin, mapkit } = await setupSearch()

    const results = await admin.query(api.emailCampaigns.searchProjects, {
      query,
    })
    expect(results[0]?.projectId).toBe(mapkit)
    expect(new Set(results.map((project) => project.projectId)).size).toBe(
      results.length,
    )
  })

  it('never offers a hidden project, by name or exact reference', async () => {
    const { admin, hidden } = await setupSearch()

    for (const query of ['mapkit-private', 'ada/mapkit-private']) {
      const results = await admin.query(api.emailCampaigns.searchProjects, {
        query,
      })
      expect(results.map((project) => project.projectId)).not.toContain(hidden)
    }
  })
})
