import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, query, type QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { getViewerOrThrow } from './lib/auth'
import {
  fanOutActivityEventToFollowersPage,
  getHomeFeedCutoff,
  getHomeFeedLegacyTarget,
} from './lib/homeFeed'
import { buildProjectCardPreview } from './lib/project_previews'
import {
  buildOwnerSnapshot,
  buildProjectExploreOwner,
  buildProjectSnapshot,
  buildSnapshotLocation,
} from './lib/snapshots'
import type { SnapshotLocation } from './lib/visibility'
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

/**
 * A profile target as served: the stored snapshot with the profile user's
 * current location under the visibility policy (`cityId` only for
 * exact-city members, `cityName` the city or region label), or no location
 * when the user has left.
 */
const enrichedProfileTargetValidator = v.object({
  kind: v.literal('profile'),
  profile: v.object({
    ...profileTargetSnapshotValidator.fields,
    cityId: v.union(v.id('cities'), v.null()),
  }),
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

export const fanOutActivityEventBatch = internalMutation({
  args: {
    eventId: v.id('activity_events'),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) return null

    const page = await fanOutActivityEventToFollowersPage(
      ctx,
      event,
      args.cursor,
    )
    if (!page.isDone && page.continueCursor !== null) {
      await ctx.scheduler.runAfter(0, internal.home.fanOutActivityEventBatch, {
        eventId: event._id,
        cursor: page.continueCursor,
      })
    }
    return null
  },
})

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
  actorGithubUsername: v.union(v.string(), v.null()),
})

type HomeFeedTarget = NonNullable<Doc<'home_feed_items'>['target']>

/**
 * What a feed row shows about its actor now, rather than when the event was
 * stored: the GitHub login for the profile link (null once the account is
 * gone) and the location the actor's current privacy setting discloses.
 */
type LiveActor = {
  githubUsername: string | null
  location: SnapshotLocation
}

const UNDISCLOSED_LOCATION: SnapshotLocation = { cityId: null, cityName: null }

/** One user read (and at most one city read) per distinct actor. */
async function loadLiveActors(
  ctx: QueryCtx,
  actorIds: Array<Id<'users'>>,
): Promise<Map<string, LiveActor>> {
  const distinctIds = [
    ...new Map(actorIds.map((actorId) => [String(actorId), actorId])).values(),
  ]
  const entries = await Promise.all(
    distinctIds.map(async (actorId): Promise<[string, LiveActor]> => {
      const actor = await ctx.db.get(actorId)
      if (!actor) {
        return [
          String(actorId),
          { githubUsername: null, location: UNDISCLOSED_LOCATION },
        ]
      }

      return [
        String(actorId),
        {
          githubUsername:
            actor.deletedAt || actor.deactivatedAt
              ? null
              : actor.github.username,
          location: await buildSnapshotLocation(ctx.db, actor),
        },
      ]
    }),
  )

  return new Map(entries)
}

async function enrichTarget(
  ctx: QueryCtx,
  target: HomeFeedTarget,
  viewerId: Id<'users'>,
) {
  if (target.kind === 'profile') {
    const profileUser = await ctx.db.get(target.profile.userId)
    const isOpenable = Boolean(
      profileUser && !profileUser.deletedAt && !profileUser.deactivatedAt,
    )
    // The stored `cityName` was written under the user's settings at the
    // time; only the live user's current disclosure is served.
    return {
      ...target,
      profile:
        profileUser && isOpenable
          ? {
              ...target.profile,
              githubUsername: profileUser.github.username,
              displayName: profileUser.profile.displayName,
              avatarUrl: profileUser.profile.avatarUrl,
              ...(await buildSnapshotLocation(ctx.db, profileUser)),
            }
          : { ...target.profile, ...UNDISCLOSED_LOCATION },
      isOpenable,
    }
  }

  const storedProject = await ctx.db.get(target.projectId)
  // A hidden/deleted project still renders its stored label, but a stored
  // snapshot must never preserve location that its owner no longer shares.
  // `ownerId` in the snapshot lets legacy rows apply the same rule after the
  // project itself has been deleted.
  const owner = await ctx.db.get(
    storedProject?.ownerId ?? target.projectSnapshot.ownerId,
  )
  const ownerLocation =
    owner && owner.deletedAt == null && owner.deactivatedAt == null
      ? await buildSnapshotLocation(ctx.db, owner)
      : UNDISCLOSED_LOCATION
  // The raw project is part of this response too; protecting just its card
  // preview leaves the old city exposed until the background copy catches up.
  const project =
    storedProject &&
    owner &&
    owner.deletedAt == null &&
    owner.deactivatedAt == null
      ? {
          ...storedProject,
          ownerSnapshot: await buildOwnerSnapshot(ctx.db, owner),
          exploreOwner: buildProjectExploreOwner(
            owner,
            storedProject.locatic.isVisible,
          ),
        }
      : null
  const projectSnapshot = {
    ...(project && project.locatic.isVisible
      ? buildProjectSnapshot(project)
      : target.projectSnapshot),
    ...ownerLocation,
  }

  return {
    ...target,
    project: project && project.locatic.isVisible ? project : null,
    projectPreview:
      project && project.locatic.isVisible
        ? await buildProjectCardPreview(ctx.db, project, {
            audience: 'public',
            owner: owner ?? undefined,
            signals: { viewerId },
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

    // Same boundary as follow backfill and the daily cleanup, so the feed
    // never shows an item the next cleanup would delete. `Date.now()` is
    // frozen per execution; an item that ages out while a subscription is
    // open drops on the next rerun, at the latest when cleanup deletes it.
    const feedPage = await ctx.db
      .query('home_feed_items')
      .withIndex('by_user_created', (query) =>
        query
          .eq('userId', viewer._id)
          .gte('createdAt', getHomeFeedCutoff(Date.now())),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    const liveActors = await loadLiveActors(
      ctx,
      feedPage.page.map((item) => item.actorId),
    )

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
          ).map((target) => enrichTarget(ctx, target, viewer._id)),
        )
        const target = item.target
          ? await enrichTarget(ctx, item.target, viewer._id)
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

        const liveActor = liveActors.get(String(item.actorId))

        return {
          ...item,
          actorSnapshot: {
            ...item.actorSnapshot,
            ...(liveActor?.location ?? UNDISCLOSED_LOCATION),
          },
          actorGithubUsername: liveActor?.githubUsername ?? null,
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
