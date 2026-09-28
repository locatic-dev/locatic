import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fixtureClerkId, seedUser } from './__tests__/fixtures.helpers'
import { campaignContentFingerprint } from './lib/email_campaigns'
import { emailRefs } from './lib/email_function_refs'
import schema from './schema'

const provider = vi.hoisted(() => ({
  segments: {
    create: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
  },
  broadcasts: {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    send: vi.fn(),
  },
  contacts: {
    segments: { add: vi.fn(), remove: vi.fn() },
  },
}))

vi.mock('resend', () => ({
  Resend: class {
    segments = provider.segments
    broadcasts = provider.broadcasts
    contacts = provider.contacts
  },
}))

const modules = import.meta.glob('./**/*.ts')
const content = {
  subject: 'Locatic update',
  preheader: 'What changed',
  introduction: 'A reviewed update.',
  projects: [],
  discussions: [],
  shippingUpdate: 'A safer delivery workflow.',
}

function configureEnvironment() {
  for (const [key, value] of Object.entries({
    EMAIL_ADMIN_CLERK_IDS: fixtureClerkId('admin'),
    EMAIL_SENDING_ENABLED: 'true',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Locatic <news@example.test>',
    EMAIL_REPLY_TO: 'reply@example.test',
    RESEND_SEGMENT_ID: 'shared_segment',
    RESEND_TOPIC_ID: 'community_topic',
  })) {
    vi.stubEnv(key, value)
  }
}

function resetProvider() {
  provider.segments.create.mockReset().mockResolvedValue({
    data: { id: 'campaign_segment' },
    error: null,
  })
  provider.segments.list.mockReset().mockResolvedValue({
    data: { data: [], has_more: false },
    error: null,
  })
  provider.segments.remove.mockReset().mockResolvedValue({
    data: { id: 'campaign_segment', deleted: true },
    error: null,
  })
  provider.contacts.segments.add.mockReset().mockResolvedValue({
    data: { id: 'provider_contact' },
    error: null,
  })
  provider.contacts.segments.remove.mockReset().mockResolvedValue({
    data: { id: 'provider_contact', deleted: true },
    error: null,
  })
  provider.broadcasts.create.mockReset().mockResolvedValue({
    data: { id: 'broadcast_1' },
    error: null,
  })
  provider.broadcasts.list.mockReset().mockResolvedValue({
    data: { data: [], has_more: false },
    error: null,
  })
  provider.broadcasts.get.mockReset().mockResolvedValue({
    data: { id: 'broadcast_1', status: 'sent' },
    error: null,
  })
  provider.broadcasts.send.mockReset().mockResolvedValue({
    data: { id: 'broadcast_1' },
    error: null,
  })
}

async function setupDispatch() {
  const t = convexTest(schema, modules)
  const adminId = await seedUser(t, { username: 'admin' })
  const userId = await seedUser(t, { username: 'reader' })
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId)
    if (!user) throw new Error('missing reader')
    await ctx.db.patch(userId, {
      notificationPrefs: { ...user.notificationPrefs, weeklyDigest: true },
      emailSubscription: {
        ...user.emailSubscription!,
        primaryEmailVerified: true,
        preferenceVersion: 1,
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
  if (!contact) throw new Error('missing email contact')
  await t.mutation(emailRefs.contacts.markSyncAttempt, {
    contactId: contact._id,
    expectedPreferenceVersion:
      contact.stateVersion ?? contact.preferenceVersion,
    providerContactId: 'provider_contact',
    syncedEmail: contact.email,
    status: 'synced',
    error: null,
  })

  const ids = await t.run(async (ctx) => {
    const now = Date.now()
    const campaignId = await ctx.db.insert('email_campaigns', {
      kind: 'announcement',
      title: 'Reviewed update',
      periodKey: null,
      periodStart: null,
      periodEnd: null,
      revision: 1,
      templateVersion: 1,
      content,
      state: 'dispatch_requested',
      preparationDiagnostics: [],
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now,
      updatedAt: now,
    })
    const storedCampaign = await ctx.db.get(campaignId)
    if (!storedCampaign) throw new Error('missing campaign')
    const runId = await ctx.db.insert('email_campaign_runs', {
      campaignId,
      campaignRevision: 1,
      requestId: `${campaignId}:1`,
      stage: 'dispatch_requested',
      subject: content.subject,
      html: '<p>A reviewed update.</p>',
      text: 'A reviewed update.',
      contentFingerprint: campaignContentFingerprint(storedCampaign.content),
      sourceFingerprint: '',
      audienceCutoffAt: now,
      audienceSummary: {
        eligible: 1,
        excludedDisabled: 0,
        excludedInactive: 0,
        excludedUnverified: 0,
        excludedSuppressed: 0,
        excludedDuplicate: 0,
        pendingSync: 0,
      },
      approvedBy: adminId,
      approvedAt: now,
      providerBroadcastId: null,
      providerSegmentId: null,
      segmentPhase: 'not_started',
      broadcastPhase: 'not_started',
      segmentCleanupAttempts: 0,
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
      contactId: contact._id,
      normalizedEmail: contact.normalizedEmail,
      stateVersion: contact.stateVersion ?? contact.preferenceVersion,
      providerContactId: 'provider_contact',
      createdAt: now,
    })
    return { campaignId, runId }
  })
  return {
    t,
    userId,
    contactId: contact._id,
    admin: t.withIdentity({ subject: fixtureClerkId('admin') }),
    ...ids,
  }
}

beforeEach(() => {
  configureEnvironment()
  resetProvider()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('email delivery provider boundary', () => {
  it('persists each checkpoint and sends one broadcast', async () => {
    const { t, runId } = await setupDispatch()

    await expect(
      t.query(emailRefs.campaigns.validateDispatchAudience, { runId }),
    ).resolves.toMatchObject({ pendingSync: 0 })

    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run).toMatchObject({
      stage: 'accepted',
      segmentPhase: 'ready',
      broadcastPhase: 'accepted',
      providerSegmentId: 'campaign_segment',
      providerBroadcastId: 'broadcast_1',
    })
    expect(provider.segments.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.send).toHaveBeenCalledTimes(1)
  })

  it('adopts a segment after a lost create response without creating twice', async () => {
    const { t, runId } = await setupDispatch()
    provider.segments.create.mockRejectedValueOnce(new Error('connection lost'))

    await t.action(emailRefs.delivery.dispatch, { runId })
    provider.segments.list.mockResolvedValue({
      data: {
        data: [
          {
            id: 'campaign_segment',
            name: `locatic-campaign-${runId}`,
          },
        ],
        has_more: false,
      },
      error: null,
    })
    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.stage).toBe('accepted')
    expect(provider.segments.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.send).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent segment recovery before provider handoff', async () => {
    const { t, runId } = await setupDispatch()
    provider.segments.create.mockRejectedValueOnce(new Error('connection lost'))
    await t.action(emailRefs.delivery.dispatch, { runId })
    provider.segments.list.mockResolvedValue({
      data: {
        data: [
          {
            id: 'campaign_segment',
            name: `locatic-campaign-${runId}`,
          },
        ],
        has_more: false,
      },
      error: null,
    })

    await Promise.all([
      t.action(emailRefs.delivery.dispatch, { runId }),
      t.action(emailRefs.delivery.dispatch, { runId }),
    ])

    expect((await t.run((ctx) => ctx.db.get(runId)))?.stage).toBe('accepted')
    expect(provider.segments.list).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.send).toHaveBeenCalledTimes(1)
  })

  it('paginates segment reconciliation before deciding no match exists', async () => {
    const { t, runId } = await setupDispatch()
    provider.segments.create.mockRejectedValueOnce(new Error('connection lost'))
    await t.action(emailRefs.delivery.dispatch, { runId })
    provider.segments.list
      .mockResolvedValueOnce({
        data: {
          data: [{ id: 'other_segment', name: 'another-campaign' }],
          has_more: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'campaign_segment',
              name: `locatic-campaign-${runId}`,
            },
          ],
          has_more: false,
        },
        error: null,
      })

    await t.action(emailRefs.delivery.dispatch, { runId })

    expect((await t.run((ctx) => ctx.db.get(runId)))?.stage).toBe('accepted')
    expect(provider.segments.list).toHaveBeenNthCalledWith(2, {
      limit: 100,
      after: 'other_segment',
    })
  })

  it('fails closed when segment reconciliation finds duplicate matches', async () => {
    const { t, runId } = await setupDispatch()
    provider.segments.create.mockRejectedValueOnce(new Error('connection lost'))
    await t.action(emailRefs.delivery.dispatch, { runId })
    provider.segments.list.mockResolvedValue({
      data: {
        data: ['segment_a', 'segment_b'].map((id) => ({
          id,
          name: `locatic-campaign-${runId}`,
        })),
        has_more: false,
      },
      error: null,
    })

    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run).toMatchObject({
      stage: 'needs_attention',
      segmentPhase: 'unknown',
    })
    expect(provider.broadcasts.create).not.toHaveBeenCalled()
    expect(provider.broadcasts.send).not.toHaveBeenCalled()
  })

  it('treats a provider 5xx segment create as ambiguous and reconciles it', async () => {
    const { t, runId } = await setupDispatch()
    provider.segments.create.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'internal_server_error',
        statusCode: 500,
        message: 'provider failed after accepting the request',
      },
    })

    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run).toMatchObject({
      stage: 'needs_attention',
      segmentPhase: 'unknown',
    })
    expect(provider.broadcasts.create).not.toHaveBeenCalled()
  })

  it('fails definitively on invalid provider credentials without advancing handoff', async () => {
    const { t, runId } = await setupDispatch()
    provider.segments.create.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'validation_error',
        statusCode: 401,
        message: 'invalid api key',
      },
    })

    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run).toMatchObject({
      stage: 'failed',
      providerSegmentId: null,
      providerBroadcastId: null,
      nextRecoveryAt: null,
    })
    expect(provider.segments.list).not.toHaveBeenCalled()
    expect(provider.broadcasts.create).not.toHaveBeenCalled()
    expect(provider.broadcasts.send).not.toHaveBeenCalled()
  })

  it('adopts a broadcast after a lost create response and sends it once', async () => {
    const { t, runId } = await setupDispatch()
    provider.broadcasts.create.mockRejectedValueOnce(new Error('timeout'))
    await t.action(emailRefs.delivery.dispatch, { runId })
    provider.broadcasts.list.mockResolvedValue({
      data: {
        data: [
          {
            id: 'broadcast_1',
            name: `locatic-campaign-${runId}`,
            segment_id: 'campaign_segment',
            status: 'draft',
          },
        ],
        has_more: false,
      },
      error: null,
    })

    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.stage).toBe('accepted')
    expect(provider.broadcasts.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.send).toHaveBeenCalledTimes(1)
  })

  it('reconciles a lost send response without issuing a second send', async () => {
    const { t, runId } = await setupDispatch()
    provider.broadcasts.send.mockRejectedValueOnce(new Error('timeout'))
    await t.action(emailRefs.delivery.dispatch, { runId })

    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.stage).toBe('accepted')
    expect(provider.broadcasts.send).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.get).toHaveBeenCalledWith('broadcast_1')
  })

  it('stops before broadcast creation when the recipient opts out during preparation', async () => {
    const { t, runId, userId } = await setupDispatch()
    provider.contacts.segments.add.mockImplementationOnce(async () => {
      await t.run(async (ctx) => {
        const user = await ctx.db.get(userId)
        if (!user) throw new Error('missing reader')
        await ctx.db.patch(userId, {
          notificationPrefs: { ...user.notificationPrefs, weeklyDigest: false },
        })
      })
      await t.mutation(emailRefs.contacts.ensureForUser, { userId })
      return { data: { id: 'provider_contact' }, error: null }
    })

    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.stage).toBe('failed')
    expect(provider.contacts.segments.remove).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.create).not.toHaveBeenCalled()
    expect(provider.broadcasts.send).not.toHaveBeenCalled()
  })

  it('retries an explicitly rejected 429 audience mutation without duplicating provider creation', async () => {
    const { t, admin, runId } = await setupDispatch()
    provider.contacts.segments.add.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'rate_limit_exceeded',
        statusCode: 429,
        message: 'retry later',
      },
    })
    await t.action(emailRefs.delivery.dispatch, { runId })
    expect((await t.run((ctx) => ctx.db.get(runId)))?.stage).toBe('failed')

    await admin.mutation(emailRefs.delivery.recover, { runId })
    await t.action(emailRefs.delivery.dispatch, { runId })

    expect((await t.run((ctx) => ctx.db.get(runId)))?.stage).toBe('accepted')
    expect(provider.segments.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.send).toHaveBeenCalledTimes(1)
  })

  it('allows cancellation during audience preparation and blocks provider handoff', async () => {
    const { t, admin, runId } = await setupDispatch()
    provider.contacts.segments.add.mockImplementationOnce(async () => {
      await admin.mutation(emailRefs.delivery.cancel, { runId })
      return { data: { id: 'provider_contact' }, error: null }
    })

    await t.action(emailRefs.delivery.dispatch, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.stage).toBe('cancelled')
    expect(provider.broadcasts.create).not.toHaveBeenCalled()
    expect(provider.broadcasts.send).not.toHaveBeenCalled()
  })

  it('serializes concurrent dispatch actions before provider creation', async () => {
    const { t, runId } = await setupDispatch()

    await Promise.all([
      t.action(emailRefs.delivery.dispatch, { runId }),
      t.action(emailRefs.delivery.dispatch, { runId }),
    ])

    expect(provider.segments.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.create).toHaveBeenCalledTimes(1)
    expect(provider.broadcasts.send).toHaveBeenCalledTimes(1)
  })
})
