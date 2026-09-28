import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fixtureClerkId, seedUser } from './__tests__/fixtures.helpers'
import { emailRefs } from './lib/email_function_refs'
import { reconcileBroadcastStatus } from './lib/resend_contract'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

afterEach(() => vi.unstubAllEnvs())

async function seedRequestedRun() {
  const t = convexTest(schema, modules)
  const adminId = await seedUser(t, { username: 'admin' })
  const ids = await t.run(async (ctx) => {
    const now = Date.now()
    const campaignId = await ctx.db.insert('email_campaigns', {
      kind: 'announcement',
      title: 'Shipping update',
      periodKey: null,
      periodStart: null,
      periodEnd: null,
      revision: 1,
      templateVersion: 1,
      content: {
        subject: 'Locatic shipping update',
        preheader: 'A concise product update',
        introduction: 'Here is what changed.',
        projects: [],
        discussions: [],
        shippingUpdate: 'We shipped a safer email workflow.',
      },
      state: 'dispatch_requested',
      preparationDiagnostics: [],
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now,
      updatedAt: now,
    })
    const runId = await ctx.db.insert('email_campaign_runs', {
      campaignId,
      campaignRevision: 1,
      requestId: `${campaignId}:1`,
      stage: 'dispatch_requested',
      subject: 'Locatic shipping update',
      html: '<p>Here is what changed.</p>',
      text: 'Here is what changed.',
      contentFingerprint: 'content',
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
      nextRecoveryAt: now,
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
    return { campaignId, runId }
  })
  return { t, ...ids }
}

describe('email delivery state', () => {
  it('claims provider creation once and makes an interrupted create require attention', async () => {
    const { t, runId } = await seedRequestedRun()

    await expect(
      t.mutation(emailRefs.delivery.claimDispatch, { runId }),
    ).resolves.toBe('create')
    await t.run((ctx) =>
      ctx.db.patch(runId, { updatedAt: Date.now() - 60_001 }),
    )
    await expect(
      t.mutation(emailRefs.delivery.claimDispatch, { runId }),
    ).resolves.toBe('reconcile_segment')
    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run?.stage).toBe('needs_attention')
    expect(run?.providerBroadcastId).toBeNull()
  })

  it('reconciles an uncertain segment create before any broadcast work', async () => {
    const { t, runId } = await seedRequestedRun()
    await t.mutation(emailRefs.delivery.claimDispatch, { runId })
    await t.mutation(emailRefs.delivery.markSegmentUnknown, {
      runId,
      error: 'Audience segment creation outcome is unknown',
    })

    await expect(
      t.mutation(emailRefs.delivery.claimDispatch, { runId }),
    ).resolves.toBe('reconcile_segment')
  })

  it('persists provider identity and recovers through status reconciliation', async () => {
    const { t, runId, campaignId } = await seedRequestedRun()
    await t.mutation(emailRefs.delivery.claimDispatch, { runId })
    await t.mutation(emailRefs.delivery.storeSegment, {
      runId,
      providerSegmentId: 'segment_1',
    })
    await expect(
      t.mutation(emailRefs.delivery.claimBroadcastCreate, { runId }),
    ).resolves.toBe(true)
    await t.mutation(emailRefs.delivery.storeBroadcast, {
      runId,
      providerBroadcastId: 'broadcast_1',
    })

    await expect(
      t.mutation(emailRefs.delivery.claimDispatch, { runId }),
    ).resolves.toBe('reconcile')
    await t.mutation(emailRefs.delivery.markStage, {
      runId,
      stage: 'accepted',
      error: null,
    })
    const [run, campaign] = await t.run((ctx) =>
      Promise.all([ctx.db.get(runId), ctx.db.get(campaignId)]),
    )
    expect(run?.providerBroadcastId).toBe('broadcast_1')
    expect(run?.stage).toBe('accepted')
    expect(campaign?.state).toBe('accepted')
  })

  it('adopts an exactly matched draft after an uncertain provider create', async () => {
    const { t, runId } = await seedRequestedRun()
    await t.mutation(emailRefs.delivery.claimDispatch, { runId })
    await t.mutation(emailRefs.delivery.storeSegment, {
      runId,
      providerSegmentId: 'segment_1',
    })
    await t.mutation(emailRefs.delivery.markBroadcastUnknown, {
      runId,
      error: 'Broadcast creation outcome is unknown',
    })

    await expect(
      t.mutation(emailRefs.delivery.claimDispatch, { runId }),
    ).resolves.toBe('recover_create')
    await t.mutation(emailRefs.delivery.adoptBroadcast, {
      runId,
      providerBroadcastId: 'broadcast_1',
    })
    await expect(
      t.mutation(emailRefs.delivery.claimDispatch, { runId }),
    ).resolves.toBe('reconcile')
  })

  it('maps only documented provider states to known outcomes', () => {
    expect(reconcileBroadcastStatus('draft')).toBe('ready')
    expect(reconcileBroadcastStatus('scheduled')).toBe('accepted')
    expect(reconcileBroadcastStatus('queued')).toBe('accepted')
    expect(reconcileBroadcastStatus('sent')).toBe('accepted')
    expect(reconcileBroadcastStatus('canceled')).toBe('cancelled')
    expect(reconcileBroadcastStatus('unknown-future-state')).toBe(
      'needs_attention',
    )
    expect(reconcileBroadcastStatus(null)).toBe('needs_attention')
  })

  it('cancels an undispatched request idempotently', async () => {
    const { t, runId, campaignId } = await seedRequestedRun()
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { stage: 'ready' })
      await ctx.db.patch(campaignId, { state: 'review_ready' })
    })
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })

    await expect(
      admin.mutation(emailRefs.delivery.cancel, { runId }),
    ).resolves.toBe('cancelled')
    await expect(
      admin.mutation(emailRefs.delivery.cancel, { runId }),
    ).resolves.toBe('cancelled')

    const [run, campaign] = await t.run((ctx) =>
      Promise.all([ctx.db.get(runId), ctx.db.get(campaignId)]),
    )
    expect(run?.stage).toBe('cancelled')
    expect(campaign?.state).toBe('cancelled')
  })

  it('refuses cancellation once broadcast creation is claimed', async () => {
    const { t, runId } = await seedRequestedRun()
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    await t.mutation(emailRefs.delivery.claimDispatch, { runId })
    await t.mutation(emailRefs.delivery.storeSegment, {
      runId,
      providerSegmentId: 'segment_1',
    })
    await t.mutation(emailRefs.delivery.claimBroadcastCreate, { runId })

    await expect(
      admin.mutation(emailRefs.delivery.cancel, { runId }),
    ).rejects.toThrow('Provider handoff may have started')
  })

  it('refuses cancellation after provider acceptance', async () => {
    const { t, runId } = await seedRequestedRun()
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    await t.run((ctx) =>
      ctx.db.patch(runId, {
        stage: 'accepted',
        broadcastPhase: 'accepted',
        providerBroadcastId: 'broadcast_accepted',
        nextRecoveryAt: null,
      }),
    )

    await expect(
      admin.mutation(emailRefs.delivery.cancel, { runId }),
    ).rejects.toThrow('Provider handoff may have started')
  })

  it('cancels an ambiguous segment-only run and retains cleanup state', async () => {
    const { t, runId } = await seedRequestedRun()
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    await t.mutation(emailRefs.delivery.claimDispatch, { runId })
    await t.mutation(emailRefs.delivery.markSegmentUnknown, {
      runId,
      error: 'Segment create response was lost',
    })

    await admin.mutation(emailRefs.delivery.cancel, { runId })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run).toMatchObject({
      stage: 'cancelled',
      segmentPhase: 'cleanup_pending',
      broadcastPhase: 'cancelled',
    })
  })

  it('keeps cancellation terminal when an in-flight worker reports failure', async () => {
    const { t, runId } = await seedRequestedRun()
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
    const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
    await t.mutation(emailRefs.delivery.claimDispatch, { runId })
    await t.mutation(emailRefs.delivery.storeSegment, {
      runId,
      providerSegmentId: 'segment_1',
    })
    await admin.mutation(emailRefs.delivery.cancel, { runId })

    await t.mutation(emailRefs.delivery.markStage, {
      runId,
      stage: 'failed',
      error: 'late worker error',
    })

    const run = await t.run((ctx) => ctx.db.get(runId))
    expect(run).toMatchObject({
      stage: 'cancelled',
      segmentPhase: 'cleanup_pending',
      broadcastPhase: 'cancelled',
      lastError: null,
    })
  })

  it('selects due recovery work without nonrecoverable rows blocking it', async () => {
    const { t, runId } = await seedRequestedRun()
    const now = Date.now()
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId)
      if (!run) throw new Error('missing run')
      const { _id, _creationTime, ...values } = run
      void _id
      void _creationTime
      for (let index = 0; index < 4; index += 1) {
        await ctx.db.insert('email_campaign_runs', {
          ...values,
          requestId: `nonrecoverable:${index}`,
          stage: 'needs_attention',
          nextRecoveryAt: null,
          updatedAt: now - 10_000 + index,
        })
      }
      await ctx.db.patch(runId, {
        stage: 'needs_attention',
        segmentPhase: 'unknown',
        nextRecoveryAt: now - 1,
      })
    })

    await expect(
      t.query(emailRefs.delivery.listRecoverable, { limit: 1 }),
    ).resolves.toEqual([runId])
  })
})
