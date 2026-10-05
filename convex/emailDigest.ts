import { ConvexError, v } from 'convex/values'

import {
  internalMutation,
  mutation,
  type MutationCtx,
} from './_generated/server'
import { requireEmailAdmin } from './lib/email_admin'
import { EMAIL_TEMPLATE_VERSION } from './lib/email_campaigns'
import {
  isCommentPubliclyInteractable,
  isProjectPubliclyInteractable,
} from './lib/project_access'
import { isOwnerDiscoverable } from './lib/snapshots'
import type { Doc } from './lib/types'

const PERIOD_MS = 14 * 24 * 60 * 60 * 1_000
const PROJECT_SCAN_LIMIT = 50
const DISCUSSION_SCAN_LIMIT = 100
const PROJECT_SELECTION_LIMIT = 5
const DISCUSSION_SELECTION_LIMIT = 2
const SITE_ORIGIN = 'https://locatic.dev'

type DigestPeriod = {
  key: string
  start: number
  end: number
}

export function getLatestDueDigestPeriod({
  anchorAt,
  now,
}: {
  anchorAt: number
  now: number
}): DigestPeriod | null {
  if (!Number.isFinite(anchorAt) || !Number.isFinite(now)) return null
  const completedPeriodIndex = Math.floor((now - anchorAt) / PERIOD_MS) - 1
  if (completedPeriodIndex < 0) return null
  const start = anchorAt + completedPeriodIndex * PERIOD_MS
  const end = start + PERIOD_MS
  return {
    key: `fortnightly:${new Date(start).toISOString()}`,
    start,
    end,
  }
}

function formatUtcDate(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(timestamp)
}

function projectUrl(project: Doc<'projects'>) {
  return `${SITE_ORIGIN}/project/${encodeURIComponent(project.github.ownerLogin)}/${encodeURIComponent(project.github.name)}`
}

async function loadProjectCandidates(ctx: MutationCtx, period: DigestPeriod) {
  const candidates = await ctx.db
    .query('projects')
    .withIndex('by_explore_eligible_activity', (index) =>
      index
        .eq('exploreOwner.isEligible', true)
        .gte('locatic.lastPublicActivityAt', period.start)
        .lt('locatic.lastPublicActivityAt', period.end),
    )
    .order('desc')
    .take(PROJECT_SCAN_LIMIT)

  const selected: Doc<'email_campaigns'>['content']['projects'] = []
  for (const project of candidates) {
    if (selected.length >= PROJECT_SELECTION_LIMIT) break
    const owner = await ctx.db.get(project.ownerId)
    const activityAt = project.locatic.lastPublicActivityAt
    if (
      !owner ||
      !activityAt ||
      !isOwnerDiscoverable(owner) ||
      !(await isProjectPubliclyInteractable(ctx, project))
    ) {
      continue
    }
    selected.push({
      projectId: project._id,
      name: project.github.name,
      fullName: project.github.fullName,
      description: project.github.description,
      url: projectUrl(project),
      activityAt,
      activityLabel: `Latest known public activity on ${formatUtcDate(activityAt)}`,
    })
  }

  return {
    selected,
    exhausted: candidates.length === PROJECT_SCAN_LIMIT,
  }
}

async function loadCommentProject(ctx: MutationCtx, comment: Doc<'comments'>) {
  if (comment.targetType === 'project') {
    const projectId = ctx.db.normalizeId('projects', comment.targetId)
    return projectId ? await ctx.db.get(projectId) : null
  }
  const postId = ctx.db.normalizeId('posts', comment.targetId)
  const post = postId ? await ctx.db.get(postId) : null
  return post && post.deletedAt === null
    ? await ctx.db.get(post.projectId)
    : null
}

async function getRootComment(
  ctx: MutationCtx,
  comment: Doc<'comments'>,
): Promise<Doc<'comments'>> {
  let current = comment
  for (let depth = 0; depth < 8 && current.parentId; depth += 1) {
    const parent = await ctx.db.get(current.parentId)
    if (!parent) break
    current = parent
  }
  return current
}

async function loadDiscussionCandidates(
  ctx: MutationCtx,
  period: DigestPeriod,
) {
  const candidates = await ctx.db
    .query('comments')
    .withIndex('by_created_at', (index) =>
      index.gte('createdAt', period.start).lt('createdAt', period.end),
    )
    .order('desc')
    .take(DISCUSSION_SCAN_LIMIT)

  const selected: Doc<'email_campaigns'>['content']['discussions'] = []
  const seenThreads = new Set<string>()
  for (const comment of candidates) {
    if (selected.length >= DISCUSSION_SELECTION_LIMIT) break
    const rootComment = await getRootComment(ctx, comment)
    if (!(await isCommentPubliclyInteractable(ctx, rootComment))) continue
    const project = await loadCommentProject(ctx, rootComment)
    if (!project || !project.exploreOwner.isEligible) continue
    const owner = await ctx.db.get(project.ownerId)
    if (!owner || !isOwnerDiscoverable(owner)) continue

    const rootCommentId = rootComment._id
    const threadKey = `${rootComment.targetType}:${rootComment.targetId}:${rootCommentId}`
    if (seenThreads.has(threadKey)) continue
    seenThreads.add(threadKey)

    const search = new URLSearchParams({ comment: String(rootCommentId) })
    if (rootComment.targetType === 'post') {
      search.set('post', rootComment.targetId)
    }
    selected.push({
      commentId: rootCommentId,
      title: `Discussion on ${project.github.name}`,
      url: `${projectUrl(project)}?${search.toString()}#comment-${rootCommentId}`,
      summary:
        rootComment.replyCount === 1
          ? 'A public community thread with 1 reply.'
          : `A public community thread with ${rootComment.replyCount} replies.`,
    })
  }

  return {
    selected,
    exhausted: candidates.length === DISCUSSION_SCAN_LIMIT,
  }
}

export const configure = mutation({
  args: { anchorAt: v.number(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    if (!Number.isFinite(args.anchorAt)) {
      throw new ConvexError('Digest anchor must be a finite UTC timestamp')
    }
    const current = await ctx.db
      .query('email_digest_config')
      .withIndex('by_key', (index) => index.eq('key', 'fortnightly'))
      .unique()
    const value = {
      anchorAt: args.anchorAt,
      enabled: args.enabled,
      updatedBy: admin._id,
      updatedAt: Date.now(),
    }
    if (current) {
      await ctx.db.patch(current._id, value)
    } else {
      await ctx.db.insert('email_digest_config', {
        key: 'fortnightly',
        ...value,
      })
    }
    return null
  },
})

export const prepareDue = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({
    status: v.union(
      v.literal('disabled'),
      v.literal('not_due'),
      v.literal('exists'),
      v.literal('created'),
    ),
    campaignId: v.union(v.id('email_campaigns'), v.null()),
  }),
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query('email_digest_config')
      .withIndex('by_key', (index) => index.eq('key', 'fortnightly'))
      .unique()
    if (!config?.enabled)
      return { status: 'disabled' as const, campaignId: null }

    const period = getLatestDueDigestPeriod({
      anchorAt: config.anchorAt,
      now: args.now ?? Date.now(),
    })
    if (!period) return { status: 'not_due' as const, campaignId: null }

    const existing = await ctx.db
      .query('email_campaigns')
      .withIndex('by_period_key', (index) => index.eq('periodKey', period.key))
      .unique()
    if (existing) {
      return { status: 'exists' as const, campaignId: existing._id }
    }

    const [projects, discussions] = await Promise.all([
      loadProjectCandidates(ctx, period),
      loadDiscussionCandidates(ctx, period),
    ])
    const diagnostics = [
      'Candidates use the latest known public activity in this fixed UTC period.',
    ]
    if (projects.exhausted) {
      diagnostics.push(
        'Project candidate scan reached its limit; suggestions may be partial.',
      )
    }
    if (discussions.exhausted) {
      diagnostics.push(
        'Discussion candidate scan reached its limit; suggestions may be partial.',
      )
    }
    if (projects.selected.length === 0 && discussions.selected.length === 0) {
      diagnostics.push(
        'No eligible public activity was found. Add editorial selections before review.',
      )
    }

    const now = Date.now()
    const campaignId = await ctx.db.insert('email_campaigns', {
      kind: 'digest',
      title: `Community update: ${formatUtcDate(period.start)} to ${formatUtcDate(period.end)}`,
      periodKey: period.key,
      periodStart: period.start,
      periodEnd: period.end,
      revision: 1,
      templateVersion: EMAIL_TEMPLATE_VERSION,
      content: {
        subject: `What Locatic builders shipped: ${formatUtcDate(period.start)} to ${formatUtcDate(period.end)}`,
        preheader:
          'A fortnight of public projects and community conversations.',
        introduction:
          'Here is a short editorial look at recent public work from the Locatic community.',
        projects: projects.selected,
        discussions: discussions.selected,
        shippingUpdate: '',
      },
      state: 'draft',
      preparationDiagnostics: diagnostics,
      createdBy: config.updatedBy,
      updatedBy: config.updatedBy,
      createdAt: now,
      updatedAt: now,
    })
    return { status: 'created' as const, campaignId }
  },
})
