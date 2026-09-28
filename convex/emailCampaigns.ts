import { ConvexError, v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { requireEmailAdmin } from './lib/email_admin'
import { emailRefs } from './lib/email_function_refs'
import type { Doc } from './lib/types'
import {
  assertCampaignContentBounds,
  assertReviewableCampaignContent,
  campaignContentFingerprint,
  EMAIL_TEMPLATE_VERSION,
  emptyCampaignContent,
} from './lib/email_campaigns'
import {
  collectEmailAudience,
  EMAIL_AUDIENCE_LIMIT,
} from './lib/email_contacts'
import {
  isCommentPubliclyInteractable,
  isProjectPubliclyInteractable,
} from './lib/project_access'
import {
  emailCampaignContentValidator,
  emailCampaignKindValidator,
  emailCampaignRunStageValidator,
  emailCampaignStateValidator,
  emailProjectSelectionValidator,
  optionalStringValidator,
  optionalTimestampValidator,
} from './lib/validators'

type DbCtx = Pick<QueryCtx | MutationCtx, 'db'>

const campaignSummaryValidator = v.object({
  id: v.id('email_campaigns'),
  kind: emailCampaignKindValidator,
  title: v.string(),
  periodStart: optionalTimestampValidator,
  periodEnd: optionalTimestampValidator,
  revision: v.number(),
  state: emailCampaignStateValidator,
  updatedAt: v.number(),
})

const audienceSummaryValidator = v.object({
  eligible: v.number(),
  excludedDisabled: v.number(),
  excludedInactive: v.number(),
  excludedUnverified: v.number(),
  excludedSuppressed: v.number(),
  excludedDuplicate: v.number(),
  pendingSync: v.number(),
})

const runSummaryValidator = v.object({
  id: v.id('email_campaign_runs'),
  revision: v.number(),
  stage: emailCampaignRunStageValidator,
  audienceSummary: audienceSummaryValidator,
  html: v.string(),
  text: v.string(),
  providerBroadcastId: optionalStringValidator,
  canCancel: v.boolean(),
  metrics: v.object({
    sent: v.number(),
    delivered: v.number(),
    bounced: v.number(),
    complained: v.number(),
    failed: v.number(),
    suppressed: v.number(),
  }),
  lastError: optionalStringValidator,
  updatedAt: v.number(),
})

const campaignDetailValidator = v.object({
  id: v.id('email_campaigns'),
  kind: emailCampaignKindValidator,
  title: v.string(),
  periodStart: optionalTimestampValidator,
  periodEnd: optionalTimestampValidator,
  revision: v.number(),
  templateVersion: v.number(),
  content: emailCampaignContentValidator,
  state: emailCampaignStateValidator,
  preparationDiagnostics: v.array(v.string()),
  sender: optionalStringValidator,
  replyTo: optionalStringValidator,
  updatedAt: v.number(),
  latestRun: v.union(runSummaryValidator, v.null()),
})

function toCampaignSummary(
  campaign: Pick<
    Doc<'email_campaigns'>,
    | '_id'
    | 'kind'
    | 'title'
    | 'periodStart'
    | 'periodEnd'
    | 'revision'
    | 'state'
    | 'updatedAt'
  >,
) {
  return {
    id: campaign._id,
    kind: campaign.kind,
    title: campaign.title,
    periodStart: campaign.periodStart,
    periodEnd: campaign.periodEnd,
    revision: campaign.revision,
    state: campaign.state,
    updatedAt: campaign.updatedAt,
  }
}

function toRunSummary(run: Awaited<ReturnType<typeof getLatestRun>>) {
  return run
    ? {
        id: run._id,
        revision: run.campaignRevision,
        stage: run.stage,
        audienceSummary: run.audienceSummary,
        html: run.html,
        text: run.text,
        providerBroadcastId: run.providerBroadcastId,
        canCancel:
          !run.providerBroadcastId &&
          [
            'ready',
            'dispatch_requested',
            'creating',
            'failed',
            'needs_attention',
          ].includes(run.stage) &&
          (run.broadcastPhase ?? 'not_started') === 'not_started',
        metrics: run.metrics,
        lastError: run.lastError,
        updatedAt: run.updatedAt,
      }
    : null
}

async function getLatestRun(ctx: DbCtx, campaignId: Id<'email_campaigns'>) {
  return await ctx.db
    .query('email_campaign_runs')
    .withIndex('by_campaign_revision', (index) =>
      index.eq('campaignId', campaignId),
    )
    .order('desc')
    .first()
}

async function listRunRecipients(ctx: DbCtx, runId: Id<'email_campaign_runs'>) {
  const recipients = await ctx.db
    .query('email_campaign_recipients')
    .withIndex('by_run', (index) => index.eq('runId', runId))
    .take(EMAIL_AUDIENCE_LIMIT + 1)
  if (recipients.length > EMAIL_AUDIENCE_LIMIT) {
    throw new ConvexError('Reviewed audience exceeds the delivery limit')
  }
  return recipients
}

async function getSourceFingerprint(
  ctx: DbCtx,
  content: Parameters<typeof campaignContentFingerprint>[0],
) {
  const parts: string[] = []
  for (const selected of content.projects) {
    const project = await ctx.db.get(selected.projectId)
    if (
      !project ||
      !project.exploreOwner.isEligible ||
      !(await isProjectPubliclyInteractable(ctx, project))
    ) {
      throw new ConvexError(
        `Selected project ${selected.fullName} is no longer eligible`,
      )
    }
    parts.push(
      `project:${project._id}:${project.updatedAt}:${project.locatic.lastPublicActivityAt ?? 0}`,
    )
  }

  for (const selected of content.discussions) {
    const comment = await ctx.db.get(selected.commentId)
    if (!(await isCommentPubliclyInteractable(ctx, comment))) {
      throw new ConvexError(
        `Selected discussion ${selected.title} is no longer public`,
      )
    }
    parts.push(
      `comment:${selected.commentId}:${comment?.isDeleted ? 'deleted' : 'live'}`,
    )
  }

  return parts.join('|')
}

export const createDraft = mutation({
  args: {
    kind: emailCampaignKindValidator,
    title: v.string(),
  },
  returns: v.id('email_campaigns'),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const title = args.title.trim()
    if (!title || title.length > 160) {
      throw new ConvexError(
        'Campaign title must be between 1 and 160 characters',
      )
    }
    const now = Date.now()
    return await ctx.db.insert('email_campaigns', {
      kind: args.kind,
      title,
      periodKey: null,
      periodStart: null,
      periodEnd: null,
      revision: 1,
      templateVersion: EMAIL_TEMPLATE_VERSION,
      content: emptyCampaignContent(),
      state: 'draft',
      preparationDiagnostics: [],
      createdBy: admin._id,
      updatedBy: admin._id,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const saveDraft = mutation({
  args: {
    campaignId: v.id('email_campaigns'),
    expectedRevision: v.number(),
    title: v.string(),
    content: emailCampaignContentValidator,
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    if (campaign.revision !== args.expectedRevision) {
      throw new ConvexError('Campaign changed. Reload before saving again.')
    }
    if (
      campaign.state === 'dispatch_requested' ||
      campaign.state === 'sending' ||
      campaign.state === 'accepted' ||
      campaign.state === 'needs_attention'
    ) {
      throw new ConvexError('Campaign cannot be edited after dispatch starts')
    }
    const title = args.title.trim()
    if (!title || title.length > 160) {
      throw new ConvexError(
        'Campaign title must be between 1 and 160 characters',
      )
    }
    assertCampaignContentBounds(args.content)
    const revision = campaign.revision + 1
    await ctx.db.patch(campaign._id, {
      title,
      content: args.content,
      revision,
      state: 'draft',
      updatedBy: admin._id,
      updatedAt: Date.now(),
    })
    return revision
  },
})

export const list = query({
  args: {},
  returns: v.array(campaignSummaryValidator),
  handler: async (ctx) => {
    await requireEmailAdmin(ctx)
    const campaigns = await ctx.db
      .query('email_campaigns')
      .withIndex('by_updated')
      .order('desc')
      .take(50)
    return campaigns.map(toCampaignSummary)
  },
})

export const searchProjects = query({
  args: { query: v.string() },
  returns: v.array(emailProjectSelectionValidator),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const normalized = args.query.trim().toLowerCase()
    if (!normalized) return []
    const candidates = await ctx.db
      .query('projects')
      .withIndex('by_explore_eligible_added', (index) =>
        index.eq('exploreOwner.isEligible', true),
      )
      .order('desc')
      .take(75)
    const results = []
    for (const project of candidates) {
      if (results.length >= 8) break
      if (
        ![project.github.fullName, project.github.description ?? '']
          .join(' ')
          .toLowerCase()
          .includes(normalized) ||
        !(await isProjectPubliclyInteractable(ctx, project))
      ) {
        continue
      }
      const activityAt = project.locatic.lastPublicActivityAt
      if (!activityAt) continue
      results.push({
        projectId: project._id,
        name: project.github.name,
        fullName: project.github.fullName,
        description: project.github.description,
        url: `https://locatic.dev/project/${encodeURIComponent(project.github.ownerLogin)}/${encodeURIComponent(project.github.name)}`,
        activityAt,
        activityLabel: `Latest known public activity on ${new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC', year: 'numeric' }).format(activityAt)}`,
      })
    }
    return results
  },
})

export const get = query({
  args: { campaignId: v.id('email_campaigns') },
  returns: v.union(campaignDetailValidator, v.null()),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) return null
    const latestRun = await getLatestRun(ctx, campaign._id)
    return {
      id: campaign._id,
      kind: campaign.kind,
      title: campaign.title,
      periodStart: campaign.periodStart,
      periodEnd: campaign.periodEnd,
      revision: campaign.revision,
      templateVersion: campaign.templateVersion,
      content: campaign.content,
      state: campaign.state,
      preparationDiagnostics: campaign.preparationDiagnostics,
      sender: process.env.EMAIL_FROM?.trim() || null,
      replyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
      updatedAt: campaign.updatedAt,
      latestRun: toRunSummary(latestRun),
    }
  },
})

export const getReviewInput = internalQuery({
  args: {
    campaignId: v.id('email_campaigns'),
    expectedRevision: v.number(),
  },
  returns: v.union(
    v.object({ content: emailCampaignContentValidator }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) return null
    if (campaign.revision !== args.expectedRevision) {
      throw new ConvexError('Campaign changed. Preview the latest revision.')
    }
    assertReviewableCampaignContent(campaign.content)
    await getSourceFingerprint(ctx, campaign.content)
    return { content: campaign.content }
  },
})

export const commitReview = internalMutation({
  args: {
    campaignId: v.id('email_campaigns'),
    expectedRevision: v.number(),
    html: v.string(),
    text: v.string(),
  },
  returns: v.id('email_campaign_runs'),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    if (campaign.revision !== args.expectedRevision) {
      throw new ConvexError('Campaign changed. Preview the latest revision.')
    }
    assertReviewableCampaignContent(campaign.content)
    const sourceFingerprint = await getSourceFingerprint(ctx, campaign.content)
    const existing = await ctx.db
      .query('email_campaign_runs')
      .withIndex('by_campaign_revision', (index) =>
        index
          .eq('campaignId', campaign._id)
          .eq('campaignRevision', campaign.revision),
      )
      .order('desc')
      .first()
    if (existing && existing.stage !== 'ready') {
      throw new ConvexError('A delivery already exists for this revision')
    }

    const audience = await collectEmailAudience(ctx)
    const audienceSummary = audience.summary
    const now = Date.now()
    const runId = existing
      ? existing._id
      : await ctx.db.insert('email_campaign_runs', {
          campaignId: campaign._id,
          campaignRevision: campaign.revision,
          requestId: `${campaign._id}:${campaign.revision}`,
          stage: 'ready',
          subject: campaign.content.subject,
          html: args.html,
          text: args.text,
          contentFingerprint: campaignContentFingerprint(campaign.content),
          sourceFingerprint,
          audienceCutoffAt: now,
          audienceSummary,
          approvedBy: admin._id,
          approvedAt: now,
          providerBroadcastId: null,
          providerSegmentId: null,
          segmentPhase: 'not_started',
          broadcastPhase: 'not_started',
          segmentCleanupAttempts: 0,
          nextRecoveryAt: null,
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
    if (existing) {
      await ctx.db.patch(existing._id, {
        subject: campaign.content.subject,
        html: args.html,
        text: args.text,
        contentFingerprint: campaignContentFingerprint(campaign.content),
        sourceFingerprint,
        audienceCutoffAt: now,
        audienceSummary,
        approvedBy: admin._id,
        approvedAt: now,
        lastError: null,
        updatedAt: now,
      })
      const previousRecipients = await listRunRecipients(ctx, existing._id)
      for (const recipient of previousRecipients) {
        await ctx.db.delete(recipient._id)
      }
    }
    for (const recipient of audience.recipients) {
      await ctx.db.insert('email_campaign_recipients', {
        runId,
        ...recipient,
        createdAt: now,
      })
    }
    await ctx.db.patch(campaign._id, {
      state: 'review_ready',
      updatedBy: admin._id,
      updatedAt: now,
    })
    return runId
  },
})

export const requestSend = mutation({
  args: {
    campaignId: v.id('email_campaigns'),
    reviewedRevision: v.number(),
    reviewId: v.id('email_campaign_runs'),
  },
  returns: v.id('email_campaign_runs'),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    if (process.env.EMAIL_SENDING_ENABLED !== 'true') {
      throw new ConvexError('Email sending is disabled in this environment')
    }
    const [campaign, run] = await Promise.all([
      ctx.db.get(args.campaignId),
      ctx.db.get(args.reviewId),
    ])
    if (!campaign || !run || run.campaignId !== campaign._id) {
      throw new ConvexError('Reviewed campaign not found')
    }
    if (
      campaign.revision !== args.reviewedRevision ||
      run.campaignRevision !== args.reviewedRevision
    ) {
      throw new ConvexError('Campaign changed. Review the latest revision.')
    }
    if (run.stage !== 'ready') {
      if (
        run.stage === 'accepted' ||
        run.stage === 'dispatch_requested' ||
        run.stage === 'creating' ||
        run.stage === 'sending'
      ) {
        return run._id
      }
      throw new ConvexError(
        run.lastError ?? 'Delivery is already in progress for this review',
      )
    }
    const sourceFingerprint = await getSourceFingerprint(ctx, campaign.content)
    if (
      run.contentFingerprint !== campaignContentFingerprint(campaign.content) ||
      run.sourceFingerprint !== sourceFingerprint
    ) {
      throw new ConvexError('Selected content changed. Prepare a new review.')
    }
    const audience = await collectEmailAudience(ctx)
    const audienceSummary = audience.summary
    if (audienceSummary.pendingSync > 0) {
      throw new ConvexError('Contact synchronization is still pending')
    }
    if (audienceSummary.eligible === 0) {
      throw new ConvexError('No eligible subscribers')
    }
    const currentByContact = new Map(
      audience.recipients.map((recipient) => [
        String(recipient.contactId),
        recipient,
      ]),
    )
    const reviewedRecipients = await listRunRecipients(ctx, run._id)
    let eligible = 0
    for (const reviewed of reviewedRecipients) {
      const current = currentByContact.get(String(reviewed.contactId))
      if (
        !current ||
        current.stateVersion !== reviewed.stateVersion ||
        current.providerContactId !== reviewed.providerContactId ||
        current.normalizedEmail !== reviewed.normalizedEmail
      ) {
        await ctx.db.delete(reviewed._id)
      } else {
        eligible += 1
      }
    }
    if (eligible === 0) throw new ConvexError('No reviewed subscribers remain')

    for (const stage of [
      'dispatch_requested',
      'creating',
      'sending',
      'needs_attention',
    ] as const) {
      const activeRuns = await ctx.db
        .query('email_campaign_runs')
        .withIndex('by_stage_updated', (index) => index.eq('stage', stage))
        .take(2)
      if (activeRuns.some((activeRun) => activeRun._id !== run._id)) {
        throw new ConvexError(
          'Another campaign delivery must finish or be reconciled first',
        )
      }
    }

    const now = Date.now()
    await ctx.db.patch(run._id, {
      stage: 'dispatch_requested',
      audienceSummary: { ...audienceSummary, eligible },
      approvedBy: admin._id,
      approvedAt: now,
      nextRecoveryAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(campaign._id, {
      state: 'dispatch_requested',
      updatedBy: admin._id,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, emailRefs.delivery.dispatch, {
      runId: run._id,
    })
    return run._id
  },
})

export const validateDispatchAudience = internalQuery({
  args: { runId: v.id('email_campaign_runs') },
  returns: v.object({
    recipients: v.array(
      v.object({
        contactId: v.id('email_contacts'),
        providerContactId: v.string(),
      }),
    ),
    pendingSync: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new ConvexError('Delivery run not found')
    const campaign = await ctx.db.get(run.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    const sourceFingerprint = await getSourceFingerprint(ctx, campaign.content)
    if (
      run.contentFingerprint !== campaignContentFingerprint(campaign.content) ||
      run.sourceFingerprint !== sourceFingerprint
    ) {
      throw new ConvexError('Selected content changed after review')
    }
    const audience = await collectEmailAudience(ctx)
    const currentByContact = new Map(
      audience.recipients.map((recipient) => [
        String(recipient.contactId),
        recipient,
      ]),
    )
    const reviewed = await listRunRecipients(ctx, run._id)
    const recipients = reviewed.flatMap((recipient) => {
      const current = currentByContact.get(String(recipient.contactId))
      return current &&
        current.stateVersion === recipient.stateVersion &&
        current.providerContactId === recipient.providerContactId &&
        current.normalizedEmail === recipient.normalizedEmail
        ? [
            {
              contactId: recipient.contactId,
              providerContactId: recipient.providerContactId,
            },
          ]
        : []
    })
    return { recipients, pendingSync: audience.summary.pendingSync }
  },
})
