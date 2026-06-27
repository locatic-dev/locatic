import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { query, type QueryCtx } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { getHomeFeedLegacyTarget } from './lib/homeFeed'
import { buildProjectCardPreview } from './lib/project_previews'
import { buildProjectSnapshot } from './lib/snapshots'
import {
  actorSnapshotValidator,
  eventTypeValidator,
  feedReasonValidator,
  homeFeedGroupKindValidator,
  homeFeedRowKindValidator,
  postSnapshotValidator,
  profileTargetSnapshotValidator,
  projectSnapshotValidator,
} from './lib/validators'
import type { Doc } from './lib/types'

const enrichedProjectTargetValidator = v.object({
  kind: v.literal('project'),
  project: v.union(v.any(), v.null()),
  projectId: v.id('projects'),
  projectPreview: v.union(v.any(), v.null()),
  projectSnapshot: projectSnapshotValidator,
  isOpenable: v.boolean(),
})

const enrichedPostTargetValidator = v.object({
  kind: v.literal('post'),
  project: v.union(v.any(), v.null()),
  projectId: v.id('projects'),
  postId: v.id('posts'),
  projectPreview: v.union(v.any(), v.null()),
  projectSnapshot: projectSnapshotValidator,
  postSnapshot: v.union(
    v.object({
      body: v.string(),
      reactionCounts: v.record(v.string(), v.number()),
      commentsCount: v.number(),
    }),
    v.null(),
  ),
  isOpenable: v.boolean(),
})

const enrichedCommentTargetValidator = v.object({
  kind: v.literal('comment'),
  project: v.union(v.any(), v.null()),
  projectId: v.id('projects'),
  postId: v.union(v.id('posts'), v.null()),
  commentId: v.id('comments'),
  rootCommentId: v.optional(v.id('comments')),
  ancestorCommentIds: v.optional(v.array(v.id('comments'))),
  targetType: v.union(v.literal('project'), v.literal('post')),
  content: v.string(),
  targetLabel: v.string(),
  projectPreview: v.union(v.any(), v.null()),
  projectSnapshot: projectSnapshotValidator,
  postSnapshot: v.optional(
    v.union(
      v.object({
        body: v.string(),
        reactionCounts: v.record(v.string(), v.number()),
        commentsCount: v.number(),
      }),
      v.null(),
    ),
  ),
  isOpenable: v.boolean(),
})

const enrichedProfileTargetValidator = v.object({
  kind: v.literal('profile'),
  profile: profileTargetSnapshotValidator,
  isOpenable: v.boolean(),
})

const enrichedPullRequestTargetValidator = v.object({
  kind: v.literal('pull_request'),
  project: v.union(v.any(), v.null()),
  projectId: v.id('projects'),
  projectPreview: v.union(v.any(), v.null()),
  projectSnapshot: projectSnapshotValidator,
  title: v.string(),
  number: v.number(),
  url: v.union(v.string(), v.null()),
  mergedAt: v.union(v.number(), v.null()),
  isOpenable: v.boolean(),
})

const enrichedHomeFeedTargetValidator = v.union(
  enrichedProjectTargetValidator,
  enrichedPostTargetValidator,
  enrichedCommentTargetValidator,
  enrichedProfileTargetValidator,
  enrichedPullRequestTargetValidator,
)

const homeFeedItemValidator = v.object({
  _id: v.id('home_feed_items'),
  _creationTime: v.number(),
  userId: v.id('users'),
  sourceEventId: v.id('activity_events'),
  dedupeKey: v.string(),
  reason: feedReasonValidator,
  priority: v.union(v.literal(1), v.literal(2), v.literal(3)),
  actorId: v.id('users'),
  eventType: eventTypeValidator,
  projectId: v.optional(v.union(v.id('projects'), v.null())),
  postId: v.optional(v.union(v.id('posts'), v.null())),
  actorSnapshot: actorSnapshotValidator,
  projectSnapshot: v.optional(v.union(projectSnapshotValidator, v.null())),
  postSnapshot: v.optional(postSnapshotValidator),
  rowKind: v.optional(homeFeedRowKindValidator),
  groupKey: v.optional(v.string()),
  groupKind: v.optional(homeFeedGroupKindValidator),
  eventCount: v.optional(v.number()),
  firstEventAt: v.optional(v.number()),
  latestEventAt: v.optional(v.number()),
  sourceEventIds: v.optional(v.array(v.id('activity_events'))),
  previewTargets: v.optional(v.array(enrichedHomeFeedTargetValidator)),
  target: v.union(enrichedHomeFeedTargetValidator, v.null()),
  createdAt: v.number(),
  project: v.union(v.any(), v.null()),
  projectPreview: v.union(v.any(), v.null()),
})

type HomeFeedTarget = NonNullable<Doc<'home_feed_items'>['target']>

async function enrichTarget(ctx: QueryCtx, target: HomeFeedTarget) {
  if (target.kind === 'profile') {
    const profileUser = await ctx.db.get(target.profile.userId)
    return {
      ...target,
      profile:
        profileUser && !profileUser.deletedAt && !profileUser.deactivatedAt
          ? {
              ...target.profile,
              githubUsername: profileUser.github.username,
              displayName: profileUser.profile.displayName,
              avatarUrl: profileUser.profile.avatarUrl,
            }
          : target.profile,
      isOpenable: Boolean(
        profileUser && !profileUser.deletedAt && !profileUser.deactivatedAt,
      ),
    }
  }

  const project = await ctx.db.get(target.projectId)
  const owner = project ? await ctx.db.get(project.ownerId) : null
  const projectSnapshot =
    project && project.locatic.isVisible
      ? buildProjectSnapshot(project)
      : target.projectSnapshot

  return {
    ...target,
    project: project && project.locatic.isVisible ? project : null,
    projectPreview:
      project && project.locatic.isVisible
        ? await buildProjectCardPreview(ctx.db, project, {
            audience: 'public',
            owner: owner ?? undefined,
          })
        : null,
    projectSnapshot,
    isOpenable: Boolean(project && project.locatic.isVisible),
  }
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(homeFeedItemValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)

    const feedPage = await ctx.db
      .query('home_feed_items')
      .withIndex('by_user_created', (query) => query.eq('userId', viewer._id))
      .order('desc')
      .paginate(args.paginationOpts)

    const page = await Promise.all(
      feedPage.page.map(async (item) => {
        const legacyTarget = getHomeFeedLegacyTarget(item)
        const previewTargets = item.previewTargets ?? []
        const enrichedTargets = await Promise.all(
          (previewTargets.length > 0
            ? previewTargets
            : legacyTarget
              ? [legacyTarget]
              : []
          ).map((target) => enrichTarget(ctx, target)),
        )
        const target = item.target
          ? await enrichTarget(ctx, item.target)
          : (enrichedTargets[0] ?? null)
        const projectId =
          item.projectId ??
          (target && 'projectId' in target ? target.projectId : null)
        const project = target && 'project' in target ? target.project : null
        const projectPreview =
          target && 'projectPreview' in target ? target.projectPreview : null
        const projectSnapshot =
          target && 'projectSnapshot' in target
            ? target.projectSnapshot
            : item.projectSnapshot

        return {
          ...item,
          projectId,
          project,
          projectPreview,
          projectSnapshot,
          target,
          previewTargets: enrichedTargets,
        }
      }),
    )

    return {
      ...feedPage,
      page,
    }
  },
})
