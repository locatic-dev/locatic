import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { buildProjectCardPreview } from './lib/project_previews'
import { buildProjectSnapshot } from './lib/snapshots'
import {
  actorSnapshotValidator,
  eventTypeValidator,
  feedReasonValidator,
  postSnapshotValidator,
  projectSnapshotValidator,
} from './lib/validators'

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
  projectId: v.id('projects'),
  postId: v.optional(v.union(v.id('posts'), v.null())),
  actorSnapshot: actorSnapshotValidator,
  projectSnapshot: projectSnapshotValidator,
  postSnapshot: v.optional(postSnapshotValidator),
  createdAt: v.number(),
  project: v.union(v.any(), v.null()),
  projectPreview: v.union(v.any(), v.null()),
})

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
        const project = await ctx.db.get(item.projectId)
        const owner = project ? await ctx.db.get(project.ownerId) : null
        const projectSnapshot =
          project && project.locatic.isVisible
            ? buildProjectSnapshot(project)
            : item.projectSnapshot

        return {
          ...item,
          project: project && project.locatic.isVisible ? project : null,
          projectPreview:
            project && project.locatic.isVisible
              ? await buildProjectCardPreview(ctx.db, project, {
                  audience: 'public',
                  owner: owner ?? undefined,
                })
              : null,
          projectSnapshot,
        }
      }),
    )

    return {
      ...feedPage,
      page,
    }
  },
})
