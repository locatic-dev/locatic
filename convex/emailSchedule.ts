import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from './_generated/server'
import { isEmailAdminViewer, requireEmailAdmin } from './lib/email_admin'
import {
  assertDigestSelectionsPublic,
  assertEmailSize,
  assertSendableCampaign,
  SEND_DELAY_MS,
  SEND_LATER_MAX_MS,
  SEND_LATER_MIN_MS,
} from './lib/email_campaigns'
import { returnToDraft } from './lib/email_schedule'
import {
  getCopyAddress,
  getEmailConfig,
  isCampaignSendingEnabled,
} from './lib/email_provider'
import {
  settingsUrl,
  UNSUBSCRIBE_URL_PLACEHOLDER,
} from './lib/emails/placeholders'
import { getResend } from './lib/resend'
import type { Doc } from './lib/types'
import {
  emailCampaignContentValidator,
  emailCopyChoiceValidator,
} from './lib/validators'

/**
 * Starting a campaign: Send (30 s, so it can be undone) and Send later
 * schedule it, Undo returns it to draft, and the scheduled job starts the
 * batch chain in `emailSends`. Each step is one transaction that re-checks
 * what it relies on.
 */

function assertCanStart(
  campaign: Doc<'email_campaigns'> | null,
  expectedRevision: number,
): asserts campaign is Doc<'email_campaigns'> {
  if (!campaign) throw new ConvexError('Campaign not found')
  if (campaign.state !== 'draft') {
    throw new ConvexError('Campaign is not a draft')
  }
  if (campaign.revision !== expectedRevision) {
    throw new ConvexError(
      'Campaign changed. Preview the latest version and send again.',
    )
  }
}

/** The saved version the send action renders. */
export const getForSend = internalQuery({
  args: { campaignId: v.id('email_campaigns'), expectedRevision: v.number() },
  returns: v.object({
    subject: v.string(),
    preheader: v.string(),
    content: emailCampaignContentValidator,
  }),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    assertCanStart(campaign, args.expectedRevision)
    return {
      subject: campaign.subject,
      preheader: campaign.preheader,
      content: campaign.content,
    }
  },
})

/**
 * Schedules the rendered artifact: in 30 s for Send (the undo window), or at
 * the chosen time for Send later. Everything the action checked is checked
 * again here, in one transaction, so a save made while the action rendered
 * rejects it. Editing is locked while scheduled.
 */
export const scheduleSend = internalMutation({
  args: {
    campaignId: v.id('email_campaigns'),
    expectedRevision: v.number(),
    html: v.string(),
    text: v.string(),
    // Absent for Send: now plus the undo window.
    sendAt: v.optional(v.number()),
    copy: emailCopyChoiceValidator,
  },
  returns: v.object({ sendAt: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    assertSendingConfigured()
    const campaign = await ctx.db.get(args.campaignId)
    assertCanStart(campaign, args.expectedRevision)
    assertSendableCampaign(campaign)
    assertEmailSize(args.html, args.text)
    await assertDigestSelectionsPublic(ctx, campaign.content)
    const now = Date.now()
    const sendAt = args.sendAt ?? now + SEND_DELAY_MS
    if (
      args.sendAt !== undefined &&
      (!Number.isFinite(sendAt) ||
        sendAt < now + SEND_LATER_MIN_MS ||
        sendAt > now + SEND_LATER_MAX_MS)
    ) {
      throw new ConvexError(
        'Pick a time at least a minute from now and within 30 days',
      )
    }
    const copyTo =
      args.copy === 'archive'
        ? getCopyAddress()
        : args.copy === 'me'
          ? admin.email
          : null
    const jobId: Id<'_scheduled_functions'> = await ctx.scheduler.runAt(
      sendAt,
      internal.emailSchedule.startScheduledSend,
      // Identifies this schedule, so a job left over from an undone one
      // never starts a later schedule early.
      { campaignId: campaign._id, scheduledAt: now },
    )
    // A new revision: another request rendered from the old one (a second
    // tab, or a slow action) can no longer schedule after an Undo.
    const revision = campaign.revision + 1
    await ctx.db.patch(campaign._id, {
      state: 'scheduled',
      revision,
      scheduled: {
        sendAt,
        revision,
        html: args.html,
        text: args.text,
        scheduledBy: admin._id,
        scheduledAt: now,
        jobId,
        copyTo,
      },
      preparationDiagnostics: [],
      updatedBy: admin._id,
      updatedAt: now,
    })
    return { sendAt }
  },
})

function assertSendingConfigured() {
  if (!isCampaignSendingEnabled()) {
    throw new ConvexError('Email sending is disabled in this environment')
  }
  if (!sendingConfigProblem()) return
  throw new ConvexError('Email configuration is incomplete')
}

function sendingConfigProblem() {
  return (
    !getEmailConfig() ||
    !process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() ||
    !process.env.CONVEX_SITE_URL ||
    !process.env.RESEND_API_KEY
  )
}

/** Undo send / cancel a scheduled send: back to an editable draft. */
export const unscheduleSend = mutation({
  // The revision the page showed, so an Undo from an old tab cannot cancel
  // a schedule made after it.
  args: { campaignId: v.id('email_campaigns'), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    if (campaign.state !== 'scheduled') {
      throw new ConvexError(
        campaign.state === 'draft'
          ? 'This campaign is not scheduled'
          : 'Already sending; it can no longer be undone',
      )
    }
    if (campaign.revision !== args.expectedRevision) {
      throw new ConvexError('Campaign changed. Reload before undoing.')
    }
    await returnToDraft(ctx, campaign, admin._id)
    return null
  },
})

/**
 * The scheduled job. Runs without a signed-in admin, so it checks that the
 * admin who scheduled it still is one. A check that fails returns the
 * campaign to draft with the reason, rather than sending it later.
 */
export const startScheduledSend = internalMutation({
  args: { campaignId: v.id('email_campaigns'), scheduledAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    const scheduled = campaign?.scheduled
    if (
      !campaign ||
      campaign.state !== 'scheduled' ||
      !scheduled ||
      scheduled.scheduledAt !== args.scheduledAt
    ) {
      return null
    }
    const admin = await ctx.db.get(scheduled.scheduledBy)
    const problem =
      campaign.revision !== scheduled.revision
        ? 'The draft changed after it was scheduled.'
        : !admin || !isEmailAdminViewer(admin.clerkId, admin)
          ? 'The admin who scheduled it no longer has access.'
          : !isCampaignSendingEnabled()
            ? 'Email sending was turned off before the send time.'
            : sendingConfigProblem()
              ? 'Email configuration was incomplete at the send time.'
              : await digestSelectionProblem(ctx, campaign)
    if (problem) {
      // The job is this function, already running: nothing to cancel.
      await returnToDraft(ctx, campaign, scheduled.scheduledBy, {
        cancelJob: false,
        diagnostic: `Not sent: ${problem}`,
      })
      return null
    }
    const now = Date.now()
    await ctx.db.patch(campaign._id, {
      state: 'sending',
      scheduled: undefined,
      sent: {
        revision: scheduled.revision,
        html: scheduled.html,
        text: scheduled.text,
        startedAt: now,
        startedBy: scheduled.scheduledBy,
        cursor: null,
        lastBatchAt: now,
      },
      updatedAt: now,
    })
    const copyEmailId = await enqueueCampaignCopy(ctx, campaign, scheduled)
    if (copyEmailId) {
      const started = await ctx.db.get(campaign._id)
      if (started?.sent) {
        await ctx.db.patch(campaign._id, {
          sent: { ...started.sent, copyEmailId },
        })
      }
    }
    await ctx.scheduler.runAfter(0, internal.emailSends.enqueueBatch, {
      campaignId: campaign._id,
    })
    return null
  },
})

/** A digest pick that went private while scheduled, as a reason. */
async function digestSelectionProblem(
  ctx: MutationCtx,
  campaign: Doc<'email_campaigns'>,
) {
  try {
    await assertDigestSelectionsPublic(ctx, campaign.content)
    return null
  } catch (error) {
    if (error instanceof ConvexError) return `${String(error.data)}.`
    throw error
  }
}

/**
 * One copy for the archive or the admin, as members will see it but with
 * the unsubscribe link pointing at Settings. Not an `email_sends` row, so it
 * never counts as a member send; its events are ignored.
 */
async function enqueueCampaignCopy(
  ctx: MutationCtx,
  campaign: Doc<'email_campaigns'>,
  scheduled: NonNullable<Doc<'email_campaigns'>['scheduled']>,
) {
  const config = getEmailConfig()
  if (!config || !scheduled.copyTo) return null
  const unsubscribeUrl = settingsUrl(config.siteUrl)
  return await getResend().sendEmail(ctx, {
    from: config.from,
    replyTo: [config.replyTo],
    to: scheduled.copyTo,
    subject: `[copy] ${campaign.subject}`,
    html: scheduled.html.replaceAll(
      UNSUBSCRIBE_URL_PLACEHOLDER,
      unsubscribeUrl,
    ),
    text: scheduled.text.replaceAll(
      UNSUBSCRIBE_URL_PLACEHOLDER,
      unsubscribeUrl,
    ),
    idempotencyKey: `campaign:${campaign._id}:copy`,
  })
}
