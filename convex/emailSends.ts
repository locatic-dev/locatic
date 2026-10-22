import {
  type EmailId,
  type EmailStatus,
  vOnEmailEventArgs,
} from '@convex-dev/resend'
import { ConvexError, v } from 'convex/values'

import { components, internal } from './_generated/api'
import { internalMutation, type MutationCtx } from './_generated/server'
import { categoryForKind, getSkipReason } from './lib/email_audience'
import { enqueuePageSize } from './lib/email_campaigns'
import { setEmailPreference } from './lib/email_preferences'
import {
  getEmailConfig,
  isCampaignSendingEnabled,
  isTestRecipient,
} from './lib/email_provider'
import {
  nextSendStatus,
  pickReconcileRows,
  type SendStatus,
  statusFromEvent,
} from './lib/email_send_status'
import { UNSUBSCRIBE_URL_PLACEHOLDER } from './lib/emails/placeholders'
import { cancelIfWaiting, getResend } from './lib/resend'
import type { Doc } from './lib/types'
import { signUnsubscribeToken } from './lib/unsubscribe_token'
import { emailCategoryValidator } from './lib/validators'

const CANCEL_PAGE_SIZE = 100
const PURGE_PAGE_SIZE = 500
const RECONCILE_LIMIT = 100
// A row is checked this long after it was enqueued, then this often.
const RECONCILE_INTERVAL_MS = 15 * 60_000
const DAY_MS = 24 * 60 * 60_000
// Reconcile only while the component surely still has its copy (finalized
// copies are deleted after 30 days, see below). Older rows keep their status.
const RECONCILE_WINDOW_MS = 25 * DAY_MS
// Component records hold recipient addresses until these cleanups.
const FINALIZED_RETENTION_MS = 30 * DAY_MS
const ABANDONED_RETENTION_MS = 60 * DAY_MS

/**
 * Applies a delivery outcome to a send row. The displayed status moves
 * forward only (a late `delivered` never replaces `complained`). A complaint
 * is handled separately and exactly once per send, whatever the status was:
 * the first one stamps `complaintHandledAt`, so a repeat, even after the
 * member turned email back on, changes nothing. If the send went to the
 * member's current address (created after `emailChangedAt`, the same rule
 * Settings uses), it also turns every email preference off, which cancels the
 * member's waiting sends. A complaint about an earlier address is recorded
 * but does not switch off email to the new one.
 */
async function applySendStatus(
  ctx: MutationCtx,
  row: Doc<'email_sends'>,
  incoming: SendStatus,
  errorMessage: string | null,
) {
  const now = Date.now()
  const next = nextSendStatus(row.status, incoming)
  const firstComplaint =
    incoming === 'complained' && row.complaintHandledAt === undefined
  if (!next && !firstComplaint) return false
  await ctx.db.patch(row._id, {
    ...(next ? { status: next } : {}),
    // A final status leaves the reconciliation schedule.
    ...(next && !isOpenStatus(next) ? { nextReconcileAt: undefined } : {}),
    ...(next && errorMessage && (next === 'bounced' || next === 'failed')
      ? { errorMessage: errorMessage.slice(0, 500) }
      : {}),
    ...(firstComplaint ? { complaintHandledAt: now } : {}),
    updatedAt: now,
  })
  const user = firstComplaint ? await ctx.db.get(row.userId) : null
  if (user && row.createdAt > (user.emailChangedAt ?? 0)) {
    for (const category of ['product_updates', 'weekly_digest'] as const) {
      await setEmailPreference(ctx, {
        userId: row.userId,
        category,
        subscribed: false,
        source: 'complaint',
      })
    }
  }
  return true
}

/** The component's `onEmailEvent` callback for Resend webhook events. */
export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const incoming = statusFromEvent(args.event.type)
    if (!incoming) return null
    // Test sends have no row.
    const row = await ctx.db
      .query('email_sends')
      .withIndex('by_email_id', (q) => q.eq('emailId', args.id))
      .unique()
    if (!row) return null
    const event = args.event
    const errorMessage =
      event.type === 'email.bounced'
        ? event.data.bounce.message
        : event.type === 'email.failed'
          ? event.data.failed.reason
          : null
    await applySendStatus(ctx, row, incoming, errorMessage)
    return null
  },
})

/** Statuses that can still change; only these stay on the check schedule. */
function isOpenStatus(status: SendStatus) {
  return status === 'queued' || status === 'sent'
}

/**
 * Copies outcomes that never reach `onEmailEvent` (API failures, exhausted
 * retries) from the component while it still has its copy. Each open row
 * carries `nextReconcileAt`: set 15 minutes after it is enqueued, pushed 15
 * minutes on after every check, and removed once the row reaches a final
 * status or is 25 days old. A run takes up to 100 due rows, half `queued` and
 * half `sent`, with slots one status cannot use going to the other. Because
 * every check moves a row to the back of the schedule, every open row is
 * visited in turn, however many there are.
 *
 * `sent` means handed to Resend with delivery not confirmed. An address
 * Resend suppresses (an earlier bounce or complaint) never produces a
 * delivery event, so its row stays `sent`; component 0.2.8 does not handle
 * `email.suppressed`. A missing component copy therefore leaves a `sent` row
 * alone. A `queued` row with no copy inside the window never left Locatic,
 * since copies are kept 30 days, and becomes `failed`.
 */
export const reconcileSends = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    const windowStart = now - RECONCILE_WINDOW_MS
    const [queued, sent] = await Promise.all(
      (['queued', 'sent'] as const).map((status) =>
        ctx.db
          .query('email_sends')
          .withIndex('by_status_and_next_reconcile_at', (q) =>
            // The lower bound skips rows without a schedule.
            q
              .eq('status', status)
              .gte('nextReconcileAt', 0)
              .lte('nextReconcileAt', now),
          )
          .take(RECONCILE_LIMIT),
      ),
    )
    const rows = pickReconcileRows(queued!, sent!, RECONCILE_LIMIT)
    const resend = getResend()
    for (const row of rows) {
      if (row.createdAt < windowStart) {
        // Past the window: the component may have deleted its copy, so the
        // row keeps its status and leaves the schedule.
        await ctx.db.patch(row._id, { nextReconcileAt: undefined })
        continue
      }
      const component = await resend.status(ctx, row.emailId as EmailId)
      if (component) {
        await applyComponentStatus(ctx, row, component)
      } else if (row.status === 'queued') {
        await applySendStatus(ctx, row, 'failed', 'No delivery record')
      }
      const current = await ctx.db.get(row._id)
      if (current && isOpenStatus(current.status)) {
        await ctx.db.patch(row._id, {
          nextReconcileAt: now + RECONCILE_INTERVAL_MS,
        })
      }
    }
    return null
  },
})

async function applyComponentStatus(
  ctx: MutationCtx,
  row: Doc<'email_sends'>,
  component: EmailStatus,
) {
  if (component.complained) {
    return await applySendStatus(ctx, row, 'complained', null)
  }
  switch (component.status) {
    case 'sent':
    case 'delivered':
    case 'bounced':
    case 'cancelled':
      return await applySendStatus(
        ctx,
        row,
        component.status,
        component.errorMessage,
      )
    case 'failed':
      return await applySendStatus(
        ctx,
        row,
        'failed',
        component.errorMessage ?? 'Delivery failed',
      )
    default:
      // waiting, queued, delivery_delayed: nothing final yet.
      return false
  }
}

/** Deletes finalized component copies after 30 days, others after 60. */
export const cleanupComponentEmails = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, {
      olderThan: FINALIZED_RETENTION_MS,
    })
    await ctx.scheduler.runAfter(
      0,
      components.resend.lib.cleanupAbandonedEmails,
      { olderThan: ABANDONED_RETENTION_MS },
    )
    return null
  },
})

/**
 * The next members to visit. Everyone: users in creation order, by Convex
 * cursor. Named members: the listed ids in order, with the cursor holding
 * the next index; accounts deleted since are left out (purged accounts take
 * their send rows with them anyway).
 */
async function audiencePage(
  ctx: MutationCtx,
  campaign: Doc<'email_campaigns'>,
  cursor: string | null,
  numItems: number,
): Promise<{ page: Doc<'users'>[]; continueCursor: string; isDone: boolean }> {
  if (campaign.audience?.kind !== 'members') {
    return await ctx.db
      .query('users')
      .order('asc')
      .paginate({ numItems, cursor })
  }
  const userIds = campaign.audience.userIds
  const start = cursor === null ? 0 : Number(cursor)
  const end = Math.min(start + numItems, userIds.length)
  const users = await Promise.all(
    userIds.slice(start, end).map((userId) => ctx.db.get(userId)),
  )
  return {
    page: users.filter((user) => user !== null),
    continueCursor: String(end),
    isDone: end >= userIds.length,
  }
}

/**
 * One page of the send: visits up to `pageSize` users in creation order from
 * the stored cursor, enqueues an email for each eligible one and records an
 * `email_sends` row in the same transaction, then schedules the next page.
 * The per-user row is the dedup guarantee, so running a page twice (Resume)
 * never sends twice; the component idempotency key backs it up.
 */
export const enqueueBatch = internalMutation({
  args: {
    campaignId: v.id('email_campaigns'),
    // Tests use small pages; production always uses the default.
    pageSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.state !== 'sending' || !campaign.sent) return null
    // Emergency stop: with EMAIL_SENDING_ENABLED off, the chain ends here and
    // the campaign stays `sending`, so the admin page shows it as stalled.
    // Emails already waiting are left for the admin to cancel; Resume
    // continues from the stored cursor once the switch is back on.
    if (!isCampaignSendingEnabled()) return null
    const sent = campaign.sent
    const config = getEmailConfig()
    const oneClickBase = process.env.CONVEX_SITE_URL?.replace(/\/+$/, '')
    if (!config || !oneClickBase) {
      // A developer error stops the chain; the admin page offers Resume.
      throw new Error('Email configuration is incomplete')
    }
    const category = categoryForKind(campaign.content.kind)
    const resend = getResend()
    // Large emails get smaller pages, so a batch never nears the
    // per-transaction write limit (`enqueuePageSize`).
    const page = await audiencePage(
      ctx,
      campaign,
      sent.cursor,
      enqueuePageSize(sent.html, sent.text, args.pageSize),
    )
    const now = Date.now()

    for (const user of page.page) {
      if (getSkipReason(user, category)) continue
      const existing = await ctx.db
        .query('email_sends')
        .withIndex('by_campaign_and_user', (q) =>
          q.eq('campaignId', campaign._id).eq('userId', user._id),
        )
        .unique()
      if (existing) continue

      // base64url plus a Convex id: safe in an href without escaping.
      const token = encodeURIComponent(
        await signUnsubscribeToken(user._id, category),
      )
      const pageUrl = `${config.siteUrl}/unsubscribe?t=${token}`
      const emailId = await resend.sendEmail(ctx, {
        from: config.from,
        replyTo: [config.replyTo],
        to: user.email,
        subject: campaign.subject,
        html: sent.html.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, pageUrl),
        text: sent.text.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, pageUrl),
        headers: [
          {
            name: 'List-Unsubscribe',
            value: `<${oneClickBase}/email/unsubscribe?t=${token}>`,
          },
          {
            name: 'List-Unsubscribe-Post',
            value: 'List-Unsubscribe=One-Click',
          },
        ],
        idempotencyKey: `campaign:${campaign._id}:user:${user._id}`,
      })
      await ctx.db.insert('email_sends', {
        campaignId: campaign._id,
        userId: user._id,
        category,
        to: user.email,
        emailId,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        nextReconcileAt: now + RECONCILE_INTERVAL_MS,
      })
    }

    if (page.isDone) {
      await ctx.db.patch(campaign._id, {
        state: 'sent',
        sent: {
          ...sent,
          cursor: page.continueCursor,
          lastBatchAt: now,
          enqueuedAt: now,
        },
        updatedAt: now,
      })
      return null
    }
    await ctx.db.patch(campaign._id, {
      sent: { ...sent, cursor: page.continueCursor, lastBatchAt: now },
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.emailSends.enqueueBatch, {
      campaignId: campaign._id,
      pageSize: args.pageSize,
    })
    return null
  },
})

/**
 * Cancels component emails Resend has not accepted yet, a page at a time,
 * for one campaign or for one user: `waiting` (not batched) and `queued` (in
 * a component batch that has not gone out; the batch worker re-reads its
 * emails and skips cancelled ones when it builds the request). A user-scoped
 * job can be narrowed to one category (an opt-out) and is bounded by
 * `before`, the time the change that requested it happened: sends created
 * later were enqueued after a fresh eligibility check (to a re-enabled
 * category, or to a new address) and are left alone. A send created in the
 * same millisecond as the change is cancelled, erring toward the opt-out.
 * Emails `sent` or later are left for delivery events and reconciliation:
 * nothing can recall what Resend accepted. It never throws for those, and it runs in its own
 * transaction so it can never roll back the change that requested it.
 */
export const cancelWaitingSends = internalMutation({
  args: {
    userId: v.optional(v.id('users')),
    category: v.optional(emailCategoryValidator),
    before: v.optional(v.number()),
    campaignId: v.optional(v.id('email_campaigns')),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, category, before, campaignId } = args
    const queued = userId
      ? category
        ? ctx.db
            .query('email_sends')
            .withIndex(
              'by_user_and_category_and_status_and_created_at',
              (q) => {
                const range = q
                  .eq('userId', userId)
                  .eq('category', category)
                  .eq('status', 'queued')
                return before === undefined
                  ? range
                  : range.lte('createdAt', before)
              },
            )
        : ctx.db
            .query('email_sends')
            .withIndex('by_user_and_status_and_created_at', (q) => {
              const range = q.eq('userId', userId).eq('status', 'queued')
              return before === undefined
                ? range
                : range.lte('createdAt', before)
            })
      : campaignId
        ? ctx.db
            .query('email_sends')
            .withIndex('by_campaign_and_status', (q) =>
              q.eq('campaignId', campaignId).eq('status', 'queued'),
            )
        : null
    if (!queued) return null

    const page = await queued.paginate({
      numItems: CANCEL_PAGE_SIZE,
      cursor: args.cursor ?? null,
    })
    const now = Date.now()
    for (const row of page.page) {
      if (!(await cancelIfWaiting(ctx, row.emailId))) continue
      await ctx.db.patch(row._id, {
        status: 'cancelled',
        nextReconcileAt: undefined,
        updatedAt: now,
      })
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
        userId,
        category,
        before,
        campaignId,
        cursor: page.continueCursor,
      })
    }
    return null
  },
})

/**
 * Account purge: deletes the member's send records and consent log in
 * bounded pages. Component copies (which hold the address) expire on the
 * component's retention schedule.
 */
export const purgeUserEmailRecords = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [sendRows, changeRows] = await Promise.all([
      ctx.db
        .query('email_sends')
        .withIndex('by_user_and_status_and_created_at', (q) =>
          q.eq('userId', args.userId),
        )
        .take(PURGE_PAGE_SIZE),
      ctx.db
        .query('email_preference_changes')
        .withIndex('by_user_and_changed_at', (q) => q.eq('userId', args.userId))
        .take(PURGE_PAGE_SIZE),
    ])
    for (const row of [...sendRows, ...changeRows]) {
      await ctx.db.delete(row._id)
    }
    if (
      sendRows.length === PURGE_PAGE_SIZE ||
      changeRows.length === PURGE_PAGE_SIZE
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.emailSends.purgeUserEmailRecords,
        args,
      )
    }
    return null
  },
})

/**
 * A test copy for an allowlisted address. No `email_sends` row: test sends
 * are not campaign results, and their events are ignored.
 */
export const enqueueTestEmail = internalMutation({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = getEmailConfig()
    if (!config) throw new ConvexError('Email configuration is incomplete')
    if (!isTestRecipient(args.to)) {
      throw new ConvexError('Test emails can only go to allowlisted addresses')
    }
    await getResend().sendEmail(ctx, {
      from: config.from,
      replyTo: [config.replyTo],
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    })
    return null
  },
})
