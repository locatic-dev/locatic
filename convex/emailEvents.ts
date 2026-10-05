import { v } from 'convex/values'

import { internalMutation } from './_generated/server'
import { applyProviderContactState } from './lib/email_contacts'
import { optionalStringValidator } from './lib/validators'

const eventResultValidator = v.object({
  status: v.union(
    v.literal('processed'),
    v.literal('duplicate'),
    v.literal('ignored'),
  ),
})

function metricForEvent(eventType: string) {
  switch (eventType) {
    case 'email.sent':
      return 'sent' as const
    case 'email.delivered':
      return 'delivered' as const
    case 'email.bounced':
      return 'bounced' as const
    case 'email.complained':
      return 'complained' as const
    case 'email.failed':
      return 'failed' as const
    case 'email.suppressed':
      return 'suppressed' as const
    default:
      return null
  }
}

export const record = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    email: v.string(),
    providerContactId: optionalStringValidator,
    providerBroadcastId: optionalStringValidator,
    providerEmailId: optionalStringValidator,
    providerUnsubscribed: v.optional(v.boolean()),
    suppression: v.optional(
      v.union(
        v.literal('hard_bounce'),
        v.literal('complaint'),
        v.literal('provider_suppressed'),
      ),
    ),
  },
  returns: eventResultValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('webhook_events')
      .withIndex('by_source_event', (index) =>
        index.eq('source', 'resend').eq('eventId', args.eventId),
      )
      .first()
    if (existing) return { status: 'duplicate' as const }

    const now = Date.now()
    const contactResult = args.email
      ? await applyProviderContactState(ctx, {
          email: args.email,
          providerContactId: args.providerContactId,
          providerUnsubscribed: args.providerUnsubscribed,
          suppression: args.suppression,
        })
      : { status: 'ignored' as const }

    const metric = metricForEvent(args.eventType)
    let metricApplied = false
    if (metric && args.providerBroadcastId) {
      const run = await ctx.db
        .query('email_campaign_runs')
        .withIndex('by_provider_broadcast', (index) =>
          index.eq('providerBroadcastId', args.providerBroadcastId),
        )
        .first()
      if (run) {
        await ctx.db.patch(run._id, {
          metrics: {
            ...run.metrics,
            [metric]: run.metrics[metric] + 1,
          },
          updatedAt: now,
        })
        metricApplied = true
      }
    }

    const status =
      contactResult.status === 'applied' || metricApplied
        ? ('processed' as const)
        : ('ignored' as const)
    await ctx.db.insert('webhook_events', {
      source: 'resend',
      eventId: args.eventId,
      eventType: args.eventType,
      status,
      receivedAt: now,
      processedAt: now,
      error: null,
    })
    return { status }
  },
})
