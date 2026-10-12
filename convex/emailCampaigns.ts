import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from './_generated/server'
import { requireEmailAdmin } from './lib/email_admin'
import { categoryForKind, getSkipReason } from './lib/email_audience'
import type { Doc } from './lib/types'
import {
  assertCampaignDraft,
  assertDigestSelectionsPublic,
  assertEmailSize,
  assertSendableCampaign,
  EMAIL_TEMPLATE_VERSION,
  LIMITS,
} from './lib/email_campaigns'
import {
  getEmailConfig,
  getSiteUrl,
  getTestRecipients,
  isCampaignSendingEnabled,
  isTestRecipient,
  isTestSendingEnabled,
} from './lib/email_provider'
import { isProjectPubliclyInteractable } from './lib/project_access'
import {
  normalizeProjectRouteKey,
  parseProjectReference,
} from './lib/project_route'
import {
  emailCampaignContentValidator,
  emailCampaignStateValidator,
  emailProjectSelectionValidator,
  emailSendStatusValidator,
  optionalStringValidator,
} from './lib/validators'

const campaignKindValidator = v.union(
  v.literal('announcement'),
  v.literal('digest'),
)

// A bounded count: `capped` means there are more than `count`, shown "N+".
const countValidator = v.object({ count: v.number(), capped: v.boolean() })

/** Counts up to `cap` rows; `capped` when more exist. */
function boundedCount(rows: unknown[], cap: number) {
  return { count: Math.min(rows.length, cap), capped: rows.length > cap }
}

const campaignSummaryValidator = v.object({
  id: v.id('email_campaigns'),
  kind: campaignKindValidator,
  title: v.string(),
  revision: v.number(),
  state: emailCampaignStateValidator,
  updatedAt: v.number(),
  // "sent to N · M delivered" for campaigns that started sending.
  results: v.union(
    v.object({ total: countValidator, delivered: countValidator }),
    v.null(),
  ),
})

// Bounded per campaign so the 50-row list stays cheap; the detail view
// counts precisely up to its own cap.
const LIST_COUNT_CAP = 100

const campaignDetailValidator = v.object({
  id: v.id('email_campaigns'),
  title: v.string(),
  subject: v.string(),
  preheader: v.string(),
  revision: v.number(),
  templateVersion: v.number(),
  content: emailCampaignContentValidator,
  state: emailCampaignStateValidator,
  preparationDiagnostics: v.array(v.string()),
  sender: optionalStringValidator,
  replyTo: optionalStringValidator,
  // Admin-only environment hints for the workspace.
  sendingEnabled: v.boolean(),
  testSendingEnabled: v.boolean(),
  testRecipients: v.array(v.string()),
  // The admin's own address when it is allowlisted for test sends.
  defaultTestRecipient: optionalStringValidator,
  updatedAt: v.number(),
  sending: v.union(
    v.object({
      startedAt: v.number(),
      lastBatchAt: v.number(),
      enqueuedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  results: v.union(
    v.object({
      counts: v.object({
        queued: countValidator,
        sent: countValidator,
        delivered: countValidator,
        bounced: countValidator,
        complained: countValidator,
        failed: countValidator,
        cancelled: countValidator,
      }),
      // Capped when any status count is.
      total: countValidator,
    }),
    v.null(),
  ),
})

const SEND_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'cancelled',
] as const
const RESULTS_COUNT_CAP = 1_000
const STALLED_AFTER_MS = 5 * 60_000

async function toCampaignSummary(
  ctx: QueryCtx,
  campaign: Doc<'email_campaigns'>,
) {
  let results = null
  if (campaign.sent) {
    const [all, delivered] = await Promise.all([
      ctx.db
        .query('email_sends')
        .withIndex('by_campaign_and_user', (q) =>
          q.eq('campaignId', campaign._id),
        )
        .take(LIST_COUNT_CAP + 1),
      ctx.db
        .query('email_sends')
        .withIndex('by_campaign_and_status', (q) =>
          q.eq('campaignId', campaign._id).eq('status', 'delivered'),
        )
        .take(LIST_COUNT_CAP + 1),
    ])
    results = {
      total: boundedCount(all, LIST_COUNT_CAP),
      delivered: boundedCount(delivered, LIST_COUNT_CAP),
    }
  }
  return {
    id: campaign._id,
    kind: campaign.content.kind,
    title: campaign.title,
    revision: campaign.revision,
    state: campaign.state,
    updatedAt: campaign.updatedAt,
    results,
  }
}

function assertTitle(value: string) {
  const title = value.trim()
  if (!title || title.length > 160) {
    throw new ConvexError('Campaign title must be between 1 and 160 characters')
  }
  return title
}

export const createDraft = mutation({
  args: {
    kind: campaignKindValidator,
    title: v.string(),
  },
  returns: v.id('email_campaigns'),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const title = assertTitle(args.title)
    const now = Date.now()
    const content: Doc<'email_campaigns'>['content'] =
      args.kind === 'digest'
        ? {
            kind: 'digest',
            body: '',
            cta: null,
            periodKey: `manual:${new Date(now).toISOString()}`,
            periodStart: now,
            periodEnd: now,
            projects: [],
            discussions: [],
          }
        : { kind: 'announcement', body: '', cta: null }
    return await ctx.db.insert('email_campaigns', {
      title,
      subject: '',
      preheader: '',
      revision: 1,
      templateVersion: EMAIL_TEMPLATE_VERSION,
      state: 'draft',
      content,
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
    subject: v.string(),
    preheader: v.string(),
    content: emailCampaignContentValidator,
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    if (campaign.state !== 'draft') {
      throw new ConvexError('Campaign can only be edited as a draft')
    }
    if (campaign.revision !== args.expectedRevision) {
      throw new ConvexError('Campaign changed. Reload before saving again.')
    }
    if (args.content.kind !== campaign.content.kind) {
      throw new ConvexError('Campaign type cannot change')
    }
    const title = assertTitle(args.title)
    // The digest period is fixed at creation; the cron deduplicates on it.
    const content =
      args.content.kind === 'digest' && campaign.content.kind === 'digest'
        ? {
            ...args.content,
            periodKey: campaign.content.periodKey,
            periodStart: campaign.content.periodStart,
            periodEnd: campaign.content.periodEnd,
          }
        : args.content
    assertCampaignDraft({ ...args, content })
    const revision = campaign.revision + 1
    await ctx.db.patch(campaign._id, {
      title,
      subject: args.subject,
      preheader: args.preheader,
      content,
      revision,
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
      .withIndex('by_updated_at')
      .order('desc')
      .take(50)
    return await Promise.all(
      campaigns.map((campaign) => toCampaignSummary(ctx, campaign)),
    )
  },
})

const PROJECT_RESULT_LIMIT = 8
// Search candidates read before the public-interactability check drops some.
const PROJECT_SEARCH_CANDIDATES = 25

function toProjectSelection(project: Doc<'projects'>, activityAt: number) {
  return {
    projectId: project._id,
    name: project.github.name,
    fullName: project.github.fullName,
    description: project.github.description,
    url: `${getSiteUrl()}/project/${encodeURIComponent(project.github.ownerLogin)}/${encodeURIComponent(project.github.name)}`,
    activityAt,
    activityLabel: `Latest known public activity on ${new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC', year: 'numeric' }).format(activityAt)}`,
  }
}

/**
 * Public projects for the digest picker. A pasted `owner/repo`, GitHub URL or
 * Locatic project URL is looked up exactly and ranked first; otherwise the
 * repository name is searched through the `search_name` index, so older
 * projects are found too. Every result must still be publicly interactable
 * and have public activity.
 */
export const searchProjects = query({
  args: { query: v.string() },
  returns: v.array(emailProjectSelectionValidator),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const text = args.query.trim()
    if (!text) return []
    const reference = parseProjectReference(text)
    const exact = reference
      ? await ctx.db
          .query('projects')
          .withIndex('by_github_route_visible', (q) =>
            q
              .eq(
                'github.ownerLoginKey',
                normalizeProjectRouteKey(reference.owner),
              )
              .eq('github.nameKey', normalizeProjectRouteKey(reference.repo))
              .eq('locatic.isVisible', true),
          )
          .first()
      : null
    const searchTerm = reference ? reference.repo : text
    const matches = await ctx.db
      .query('projects')
      .withSearchIndex('search_name', (q) =>
        q.search('github.name', searchTerm).eq('exploreOwner.isEligible', true),
      )
      .take(PROJECT_SEARCH_CANDIDATES)
    const results = []
    const seen = new Set<string>()
    for (const project of exact ? [exact, ...matches] : matches) {
      if (results.length >= PROJECT_RESULT_LIMIT) break
      if (seen.has(project._id)) continue
      seen.add(project._id)
      const activityAt = project.locatic.lastPublicActivityAt
      if (
        !activityAt ||
        !project.exploreOwner.isEligible ||
        !(await isProjectPubliclyInteractable(ctx, project))
      ) {
        continue
      }
      results.push(toProjectSelection(project, activityAt))
    }
    return results
  },
})

export const get = query({
  args: { campaignId: v.id('email_campaigns') },
  returns: v.union(campaignDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) return null
    return {
      id: campaign._id,
      title: campaign.title,
      subject: campaign.subject,
      preheader: campaign.preheader,
      revision: campaign.revision,
      templateVersion: campaign.templateVersion,
      content: campaign.content,
      state: campaign.state,
      preparationDiagnostics: campaign.preparationDiagnostics,
      sender: process.env.EMAIL_FROM?.trim() || null,
      replyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
      sendingEnabled: isCampaignSendingEnabled(),
      testSendingEnabled: isTestSendingEnabled(),
      testRecipients: getTestRecipients(),
      defaultTestRecipient: isTestRecipient(admin.email) ? admin.email : null,
      updatedAt: campaign.updatedAt,
      sending: campaign.sent
        ? {
            startedAt: campaign.sent.startedAt,
            lastBatchAt: campaign.sent.lastBatchAt,
            enqueuedAt: campaign.sent.enqueuedAt ?? null,
          }
        : null,
      results: campaign.sent ? await countSends(ctx, campaign._id) : null,
    }
  },
})

// Counted from email_sends by index; @convex-dev/aggregate is the upgrade
// path if this gets slow.
async function countSends(ctx: QueryCtx, campaignId: Id<'email_campaigns'>) {
  const entries = await Promise.all(
    SEND_STATUSES.map(async (status) => {
      const rows = await ctx.db
        .query('email_sends')
        .withIndex('by_campaign_and_status', (q) =>
          q.eq('campaignId', campaignId).eq('status', status),
        )
        .take(RESULTS_COUNT_CAP + 1)
      return [status, boundedCount(rows, RESULTS_COUNT_CAP)] as const
    }),
  )
  const counts = Object.fromEntries(entries) as Record<
    (typeof SEND_STATUSES)[number],
    { count: number; capped: boolean }
  >
  const total = {
    count: entries.reduce((sum, [, value]) => sum + value.count, 0),
    capped: entries.some(([, value]) => value.capped),
  }
  return { counts, total }
}

export const listRecipients = query({
  args: {
    campaignId: v.id('email_campaigns'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      id: v.id('email_sends'),
      displayName: v.string(),
      githubUsername: v.string(),
      status: emailSendStatusValidator,
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const result = await ctx.db
      .query('email_sends')
      .withIndex('by_campaign_and_user', (q) =>
        q.eq('campaignId', args.campaignId),
      )
      .paginate(args.paginationOpts)
    const page = []
    for (const row of result.page) {
      const user = await ctx.db.get(row.userId)
      page.push({
        id: row._id,
        displayName: user?.profile.displayName ?? 'Deleted user',
        githubUsername: user?.github.username ?? '',
        status: row.status,
        updatedAt: row.updatedAt,
      })
    }
    return { ...result, page }
  },
})

/** For actions, which inherit the caller's identity in runQuery. */
export const assertAdmin = internalQuery({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => {
    const admin = await requireEmailAdmin(ctx)
    return admin._id
  },
})

const SEND_PREVIEW_SAMPLE = 5

// An estimate for the confirmation dialog from the first 100 members (full
// user documents are large, so this stays a small read). The audience is
// computed again, user by user, while sending (design D3); `capped` means
// more members exist than were counted.
export const getSendPreview = query({
  args: { campaignId: v.id('email_campaigns') },
  returns: v.object({
    estimatedCount: v.number(),
    capped: v.boolean(),
    sample: v.array(
      v.object({ displayName: v.string(), githubUsername: v.string() }),
    ),
    skipped: v.object({
      unsubscribed: v.number(),
      unverified: v.number(),
      inactive: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    const category = categoryForKind(campaign.content.kind)
    const users = await ctx.db
      .query('users')
      .take(LIMITS.sendPreviewMembers + 1)
    const skipped = { unsubscribed: 0, unverified: 0, inactive: 0 }
    const sample: Array<{ displayName: string; githubUsername: string }> = []
    let estimatedCount = 0
    for (const user of users.slice(0, LIMITS.sendPreviewMembers)) {
      const reason = getSkipReason(user, category)
      if (reason) {
        skipped[reason] += 1
        continue
      }
      estimatedCount += 1
      if (sample.length < SEND_PREVIEW_SAMPLE) {
        sample.push({
          displayName: user.profile.displayName,
          githubUsername: user.github.username,
        })
      }
    }
    return {
      estimatedCount,
      capped: users.length > LIMITS.sendPreviewMembers,
      sample,
      skipped,
    }
  },
})

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
 * Commits the rendered artifact and starts the batch chain. Everything the
 * action checked is checked again here, in one transaction, so a save made
 * while the action rendered rejects the send.
 */
export const startSend = internalMutation({
  args: {
    campaignId: v.id('email_campaigns'),
    expectedRevision: v.number(),
    html: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    if (!isCampaignSendingEnabled()) {
      throw new ConvexError('Email sending is disabled in this environment')
    }
    if (
      !getEmailConfig() ||
      !process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() ||
      !process.env.CONVEX_SITE_URL ||
      !process.env.RESEND_API_KEY
    ) {
      throw new ConvexError('Email configuration is incomplete')
    }
    const campaign = await ctx.db.get(args.campaignId)
    assertCanStart(campaign, args.expectedRevision)
    assertSendableCampaign(campaign)
    assertEmailSize(args.html, args.text)
    await assertDigestSelectionsPublic(ctx, campaign.content)
    const now = Date.now()
    await ctx.db.patch(campaign._id, {
      state: 'sending',
      sent: {
        revision: campaign.revision,
        html: args.html,
        text: args.text,
        startedAt: now,
        startedBy: admin._id,
        cursor: null,
        lastBatchAt: now,
      },
      updatedBy: admin._id,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.emailSends.enqueueBatch, {
      campaignId: campaign._id,
    })
    return null
  },
})

/**
 * Stops further batches and cancels emails still waiting in the component.
 * Emails already handed to Resend cannot be recalled.
 */
export const cancelSend = mutation({
  args: { campaignId: v.id('email_campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    if (campaign.state === 'draft') {
      throw new ConvexError('Only a campaign that is sending can be cancelled')
    }
    if (campaign.state === 'sending') {
      await ctx.db.patch(campaign._id, {
        state: 'cancelled',
        updatedBy: admin._id,
        updatedAt: Date.now(),
      })
    }
    await ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
      campaignId: campaign._id,
    })
    return null
  },
})

/** Restarts a stalled batch chain from the stored cursor. */
export const resumeSend = mutation({
  args: { campaignId: v.id('email_campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    if (campaign.state !== 'sending' || !campaign.sent) {
      throw new ConvexError('Only a campaign that is sending can be resumed')
    }
    if (!isCampaignSendingEnabled()) {
      throw new ConvexError('Email sending is disabled in this environment')
    }
    if (campaign.sent.lastBatchAt > Date.now() - STALLED_AFTER_MS) {
      throw new ConvexError('Sending is still in progress')
    }
    await ctx.scheduler.runAfter(0, internal.emailSends.enqueueBatch, {
      campaignId: campaign._id,
    })
    return null
  },
})
