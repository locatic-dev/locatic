import { ConvexError, v } from 'convex/values'

import { internalMutation, internalQuery, mutation } from './_generated/server'
import { emailRefs } from './lib/email_function_refs'
import { requireEmailAdmin } from './lib/email_admin'
import {
  emailBroadcastPhaseValidator,
  emailCampaignRunStageValidator,
  emailSegmentPhaseValidator,
  optionalStringValidator,
} from './lib/validators'

const RECOVERY_LEASE_MS = 60_000
const RECOVERY_RETRY_MS = 5 * 60_000

function getSegmentPhase(run: {
  stage: string
  providerSegmentId?: string | null
  segmentPhase?:
    | 'not_started'
    | 'creating'
    | 'unknown'
    | 'reconciling'
    | 'ready'
    | 'cleanup_pending'
    | 'cleaned'
}) {
  if (run.segmentPhase) return run.segmentPhase
  if (run.providerSegmentId) return 'ready' as const
  if (run.stage === 'needs_attention') return 'unknown' as const
  return 'not_started' as const
}

function getBroadcastPhase(run: {
  stage: string
  providerBroadcastId?: string | null
  broadcastPhase?:
    | 'not_started'
    | 'creating'
    | 'unknown'
    | 'reconciling'
    | 'ready'
    | 'sending'
    | 'accepted'
    | 'cancelled'
}) {
  if (run.broadcastPhase) return run.broadcastPhase
  if (run.stage === 'accepted') return 'accepted' as const
  if (run.providerBroadcastId) {
    return run.stage === 'sending' ? ('sending' as const) : ('unknown' as const)
  }
  return 'not_started' as const
}

const deliveryContextValidator = v.object({
  runId: v.id('email_campaign_runs'),
  campaignId: v.id('email_campaigns'),
  campaignTitle: v.string(),
  preheader: v.string(),
  requestId: v.string(),
  stage: emailCampaignRunStageValidator,
  subject: v.string(),
  html: v.string(),
  text: v.string(),
  providerBroadcastId: optionalStringValidator,
  providerSegmentId: optionalStringValidator,
  segmentPhase: emailSegmentPhaseValidator,
  broadcastPhase: emailBroadcastPhaseValidator,
  segmentCleanupAttempts: v.number(),
})

export const getContext = internalQuery({
  args: { runId: v.id('email_campaign_runs') },
  returns: v.union(deliveryContextValidator, v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return null
    const campaign = await ctx.db.get(run.campaignId)
    if (!campaign) return null
    return {
      runId: run._id,
      campaignId: campaign._id,
      campaignTitle: campaign.title,
      preheader: campaign.content.preheader,
      requestId: run.requestId,
      stage: run.stage,
      subject: run.subject,
      html: run.html,
      text: run.text,
      providerBroadcastId: run.providerBroadcastId,
      providerSegmentId: run.providerSegmentId ?? null,
      segmentPhase: getSegmentPhase(run),
      broadcastPhase: getBroadcastPhase(run),
      segmentCleanupAttempts: run.segmentCleanupAttempts ?? 0,
    }
  },
})

export const listRecoverable = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.id('email_campaign_runs')),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 25)
    const runs = await ctx.db
      .query('email_campaign_runs')
      .withIndex('by_next_recovery', (index) =>
        index.gt('nextRecoveryAt', null).lte('nextRecoveryAt', Date.now()),
      )
      .take(limit)
    return runs.map((run) => run._id)
  },
})

export const claimDispatch = internalMutation({
  args: { runId: v.id('email_campaign_runs') },
  returns: v.union(
    v.literal('create'),
    v.literal('reconcile'),
    v.literal('reconcile_segment'),
    v.literal('recover_create'),
    v.literal('cleanup_segment'),
    v.literal('stop'),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return 'stop' as const
    const now = Date.now()
    const segmentPhase = getSegmentPhase(run)
    const broadcastPhase = getBroadcastPhase(run)

    if (run.stage === 'cancelled') {
      if (segmentPhase !== 'cleanup_pending') return 'stop' as const
      if (run.updatedAt > now - 60_000) return 'stop' as const
      await ctx.db.patch(run._id, {
        segmentPhase: 'reconciling',
        nextRecoveryAt: now + RECOVERY_LEASE_MS,
        updatedAt: now,
      })
      return 'cleanup_segment' as const
    }

    if (run.stage === 'dispatch_requested') {
      await ctx.db.patch(run._id, {
        stage: 'creating',
        segmentPhase: run.providerSegmentId ? 'ready' : 'creating',
        broadcastPhase: run.providerBroadcastId ? 'ready' : 'not_started',
        nextRecoveryAt: now + RECOVERY_LEASE_MS,
        lastError: null,
        updatedAt: now,
      })
      await ctx.db.patch(run.campaignId, {
        state: 'sending',
        updatedAt: now,
      })
      return 'create' as const
    }

    if (
      (run.stage === 'needs_attention' || run.stage === 'sending') &&
      run.providerBroadcastId
    ) {
      if (
        broadcastPhase === 'reconciling' &&
        run.nextRecoveryAt !== null &&
        run.nextRecoveryAt !== undefined &&
        run.nextRecoveryAt > now
      ) {
        return 'stop' as const
      }
      await ctx.db.patch(run._id, {
        broadcastPhase: 'reconciling',
        nextRecoveryAt: now + RECOVERY_LEASE_MS,
        updatedAt: now,
      })
      return 'reconcile' as const
    }

    if (
      run.stage === 'needs_attention' &&
      !run.providerBroadcastId &&
      run.providerSegmentId &&
      (broadcastPhase === 'unknown' || broadcastPhase === 'reconciling')
    ) {
      if (broadcastPhase === 'reconciling' && run.updatedAt > now - 60_000) {
        return 'stop' as const
      }
      await ctx.db.patch(run._id, {
        broadcastPhase: 'reconciling',
        nextRecoveryAt: now + RECOVERY_LEASE_MS,
        updatedAt: now,
      })
      return 'recover_create' as const
    }

    if (
      !run.providerSegmentId &&
      (run.stage === 'needs_attention' || run.stage === 'creating') &&
      (segmentPhase === 'unknown' ||
        segmentPhase === 'reconciling' ||
        (segmentPhase === 'creating' && run.updatedAt <= now - 60_000))
    ) {
      if (segmentPhase === 'reconciling' && run.updatedAt > now - 60_000) {
        return 'stop' as const
      }
      await ctx.db.patch(run._id, {
        stage: 'needs_attention',
        segmentPhase: 'reconciling',
        nextRecoveryAt: now + RECOVERY_LEASE_MS,
        updatedAt: now,
      })
      return 'reconcile_segment' as const
    }

    if (
      run.stage === 'needs_attention' &&
      run.providerSegmentId &&
      segmentPhase === 'ready' &&
      broadcastPhase === 'not_started'
    ) {
      await ctx.db.patch(run._id, {
        stage: 'creating',
        nextRecoveryAt: now + RECOVERY_LEASE_MS,
        lastError: null,
        updatedAt: now,
      })
      return 'create' as const
    }

    if (run.stage === 'creating' && !run.providerBroadcastId) {
      if (run.updatedAt > now - 60_000) return 'stop' as const
      if (run.providerSegmentId && segmentPhase === 'ready') {
        return 'create' as const
      }
      await ctx.db.patch(run._id, {
        stage: 'needs_attention',
        segmentPhase: 'unknown',
        nextRecoveryAt: now,
        lastError:
          'Broadcast creation outcome is unknown. Reconcile provider drafts before retrying.',
        updatedAt: now,
      })
    }

    return 'stop' as const
  },
})

export const storeBroadcast = internalMutation({
  args: {
    runId: v.id('email_campaign_runs'),
    providerBroadcastId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (
      !run ||
      run.stage !== 'creating' ||
      getBroadcastPhase(run) !== 'creating'
    ) {
      throw new ConvexError('Delivery run is not creating a broadcast')
    }
    await ctx.db.patch(run._id, {
      providerBroadcastId: args.providerBroadcastId,
      stage: 'sending',
      broadcastPhase: 'ready',
      nextRecoveryAt: Date.now() + RECOVERY_LEASE_MS,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const adoptBroadcast = internalMutation({
  args: {
    runId: v.id('email_campaign_runs'),
    providerBroadcastId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (
      !run ||
      run.stage !== 'needs_attention' ||
      run.providerBroadcastId ||
      getBroadcastPhase(run) !== 'reconciling'
    ) {
      throw new ConvexError('Delivery run cannot adopt a provider broadcast')
    }
    await ctx.db.patch(run._id, {
      providerBroadcastId: args.providerBroadcastId,
      stage: 'sending',
      broadcastPhase: 'ready',
      nextRecoveryAt: Date.now() + RECOVERY_LEASE_MS,
      lastError: null,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const storeSegment = internalMutation({
  args: {
    runId: v.id('email_campaign_runs'),
    providerSegmentId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (
      !run ||
      run.stage !== 'creating' ||
      getSegmentPhase(run) !== 'creating'
    ) {
      throw new ConvexError('Delivery run is not preparing its audience')
    }
    await ctx.db.patch(run._id, {
      providerSegmentId: args.providerSegmentId,
      segmentPhase: 'ready',
      nextRecoveryAt: Date.now() + RECOVERY_LEASE_MS,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const adoptSegment = internalMutation({
  args: {
    runId: v.id('email_campaign_runs'),
    providerSegmentId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (
      !run ||
      run.stage !== 'needs_attention' ||
      run.providerSegmentId ||
      getSegmentPhase(run) !== 'reconciling'
    ) {
      throw new ConvexError('Delivery run cannot adopt a provider segment')
    }
    await ctx.db.patch(run._id, {
      providerSegmentId: args.providerSegmentId,
      segmentPhase: 'ready',
      stage: 'creating',
      nextRecoveryAt: Date.now() + RECOVERY_LEASE_MS,
      lastError: null,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const markSegmentUnknown = internalMutation({
  args: { runId: v.id('email_campaign_runs'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.stage === 'cancelled' || run.providerSegmentId) return null
    await ctx.db.patch(run._id, {
      stage: 'needs_attention',
      segmentPhase: 'unknown',
      nextRecoveryAt: Date.now(),
      lastError: args.error,
      updatedAt: Date.now(),
    })
    await ctx.db.patch(run.campaignId, {
      state: 'needs_attention',
      updatedAt: Date.now(),
    })
    return null
  },
})

export const claimBroadcastCreate = internalMutation({
  args: { runId: v.id('email_campaign_runs') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (
      !run ||
      run.stage !== 'creating' ||
      !run.providerSegmentId ||
      run.providerBroadcastId ||
      getSegmentPhase(run) !== 'ready' ||
      getBroadcastPhase(run) !== 'not_started'
    ) {
      return false
    }
    await ctx.db.patch(run._id, {
      broadcastPhase: 'creating',
      nextRecoveryAt: Date.now() + RECOVERY_LEASE_MS,
      updatedAt: Date.now(),
    })
    return true
  },
})

export const markBroadcastUnknown = internalMutation({
  args: { runId: v.id('email_campaign_runs'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.stage === 'cancelled') return null
    await ctx.db.patch(run._id, {
      stage: 'needs_attention',
      broadcastPhase: 'unknown',
      nextRecoveryAt: Date.now(),
      lastError: args.error,
      updatedAt: Date.now(),
    })
    await ctx.db.patch(run.campaignId, {
      state: 'needs_attention',
      updatedAt: Date.now(),
    })
    return null
  },
})

export const claimBroadcastSend = internalMutation({
  args: { runId: v.id('email_campaign_runs') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (
      !run ||
      run.stage !== 'sending' ||
      !run.providerBroadcastId ||
      getBroadcastPhase(run) !== 'ready'
    ) {
      return false
    }
    await ctx.db.patch(run._id, {
      broadcastPhase: 'sending',
      nextRecoveryAt: Date.now() + RECOVERY_LEASE_MS,
      updatedAt: Date.now(),
    })
    return true
  },
})

export const markSegmentCleaned = internalMutation({
  args: {
    runId: v.id('email_campaign_runs'),
    cleaned: v.boolean(),
    error: optionalStringValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.stage !== 'cancelled') return null
    const attempts = (run.segmentCleanupAttempts ?? 0) + 1
    const retryDelay = Math.min(
      24 * 60 * 60_000,
      2 ** Math.min(attempts - 1, 12) * RECOVERY_RETRY_MS,
    )
    await ctx.db.patch(run._id, {
      providerSegmentId: args.cleaned ? null : run.providerSegmentId,
      segmentPhase: args.cleaned ? 'cleaned' : 'cleanup_pending',
      segmentCleanupAttempts: attempts,
      nextRecoveryAt: args.cleaned ? null : Date.now() + retryDelay,
      lastError: args.cleaned ? null : args.error,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const markStage = internalMutation({
  args: {
    runId: v.id('email_campaign_runs'),
    stage: emailCampaignRunStageValidator,
    error: optionalStringValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return null
    if (run.stage === 'cancelled' && args.stage !== 'cancelled') return null
    const now = Date.now()
    await ctx.db.patch(run._id, {
      stage: args.stage,
      ...(args.stage === 'accepted'
        ? { broadcastPhase: 'accepted' as const }
        : args.stage === 'cancelled'
          ? { broadcastPhase: 'cancelled' as const }
          : args.stage === 'failed' && !run.providerBroadcastId
            ? { broadcastPhase: 'not_started' as const }
            : {}),
      nextRecoveryAt:
        args.stage === 'creating' || args.stage === 'sending'
          ? now + RECOVERY_LEASE_MS
          : args.stage === 'needs_attention'
            ? now + RECOVERY_RETRY_MS
            : null,
      lastError: args.error,
      updatedAt: now,
    })
    const state =
      args.stage === 'accepted'
        ? ('accepted' as const)
        : args.stage === 'failed'
          ? ('failed' as const)
          : args.stage === 'cancelled'
            ? ('cancelled' as const)
            : args.stage === 'needs_attention'
              ? ('needs_attention' as const)
              : ('sending' as const)
    await ctx.db.patch(run.campaignId, { state, updatedAt: now })
    return null
  },
})

export const recover = mutation({
  args: { runId: v.id('email_campaign_runs') },
  returns: v.union(v.literal('scheduled'), v.literal('accepted')),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const run = await ctx.db.get(args.runId)
    if (!run) throw new ConvexError('Delivery run not found')
    if (run.stage === 'accepted') return 'accepted' as const
    const canReconcile =
      (run.stage === 'needs_attention' &&
        Boolean(
          run.providerSegmentId ||
          run.providerBroadcastId ||
          getSegmentPhase(run) === 'unknown' ||
          getBroadcastPhase(run) === 'unknown',
        )) ||
      (run.stage === 'sending' && Boolean(run.providerBroadcastId))
    const canRetryBeforeBroadcast =
      run.stage === 'failed' && !run.providerBroadcastId
    if (!canReconcile && !canRetryBeforeBroadcast) {
      throw new ConvexError(
        run.lastError ??
          'This delivery cannot be retried without provider review',
      )
    }
    const now = Date.now()
    if (canRetryBeforeBroadcast) {
      await ctx.db.patch(run._id, {
        stage: 'dispatch_requested',
        segmentPhase: run.providerSegmentId ? 'ready' : 'not_started',
        broadcastPhase: 'not_started',
        nextRecoveryAt: now,
        retryCount: run.retryCount + 1,
        lastError: null,
        updatedAt: now,
      })
      await ctx.db.patch(run.campaignId, {
        state: 'dispatch_requested',
        updatedBy: admin._id,
        updatedAt: now,
      })
    }
    await ctx.scheduler.runAfter(0, emailRefs.delivery.dispatch, {
      runId: run._id,
    })
    return 'scheduled' as const
  },
})

export const cancel = mutation({
  args: { runId: v.id('email_campaign_runs') },
  returns: v.literal('cancelled'),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const run = await ctx.db.get(args.runId)
    if (!run) throw new ConvexError('Delivery run not found')
    if (run.stage === 'cancelled') return 'cancelled' as const

    const segmentPhase = getSegmentPhase(run)
    const broadcastPhase = getBroadcastPhase(run)
    if (
      run.stage === 'accepted' ||
      run.providerBroadcastId ||
      broadcastPhase === 'creating' ||
      broadcastPhase === 'unknown' ||
      broadcastPhase === 'reconciling' ||
      broadcastPhase === 'sending' ||
      broadcastPhase === 'accepted'
    ) {
      throw new ConvexError(
        'Provider handoff may have started. Reconcile delivery before cancelling.',
      )
    }
    if (
      run.stage !== 'ready' &&
      run.stage !== 'dispatch_requested' &&
      run.stage !== 'creating' &&
      run.stage !== 'failed' &&
      run.stage !== 'needs_attention'
    ) {
      throw new ConvexError('This delivery can no longer be cancelled')
    }

    const now = Date.now()
    const needsSegmentCleanup =
      Boolean(run.providerSegmentId) ||
      segmentPhase === 'creating' ||
      segmentPhase === 'unknown' ||
      segmentPhase === 'reconciling' ||
      segmentPhase === 'ready'
    await ctx.db.patch(run._id, {
      stage: 'cancelled',
      segmentPhase: needsSegmentCleanup ? 'cleanup_pending' : 'cleaned',
      broadcastPhase: 'cancelled',
      nextRecoveryAt: needsSegmentCleanup ? now + RECOVERY_LEASE_MS : null,
      lastError: null,
      updatedAt: now,
    })
    await ctx.db.patch(run.campaignId, {
      state: 'cancelled',
      updatedBy: admin._id,
      updatedAt: now,
    })
    if (needsSegmentCleanup) {
      await ctx.scheduler.runAfter(60_000, emailRefs.delivery.dispatch, {
        runId: run._id,
      })
    }
    return 'cancelled' as const
  },
})

export const getTestArtifact = internalQuery({
  args: { reviewId: v.id('email_campaign_runs') },
  returns: v.union(
    v.object({
      adminId: v.id('users'),
      subject: v.string(),
      html: v.string(),
      text: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const run = await ctx.db.get(args.reviewId)
    if (!run) return null
    return {
      adminId: admin._id,
      subject: run.subject,
      html: run.html,
      text: run.text,
    }
  },
})
