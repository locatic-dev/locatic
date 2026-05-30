import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { buildProjectCardPreview } from './lib/project_previews'
import { buildProjectSnapshot } from './lib/snapshots'

export const list = query({
  args: {
    paginationOpts: v.optional(paginationOptsValidator),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const paginationOpts = args.paginationOpts ?? {
      cursor: args.cursor ? String(args.cursor) : null,
      numItems: Math.min(args.limit ?? 20, 50),
    }

    const feedPage = await ctx.db
      .query('home_feed_items')
      .withIndex('by_user_created', (query) => query.eq('userId', viewer._id))
      .order('desc')
      .paginate(paginationOpts)

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
