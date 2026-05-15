import { v } from 'convex/values'

import { internalMutation, query } from './_generated/server'
import { buildPulseSnapshotRows } from './lib/pulse'

export const listPublic = query({
  args: {
    scopeType: v.union(v.literal('city'), v.literal('global')),
    scopeId: v.union(v.string(), v.null()),
    timeWindow: v.union(
      v.literal('day'),
      v.literal('week'),
      v.literal('month'),
    ),
    sort: v.union(
      v.literal('locatic_likes'),
      v.literal('comments'),
      v.literal('github_stars'),
    ),
    page: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = Math.max(args.page ?? 1, 1)
    const snapshots = await ctx.db
      .query('pulse_snapshots')
      .withIndex('by_scope_window_sort_rank', (query) =>
        query
          .eq('scopeType', args.scopeType)
          .eq('scopeId', args.scopeId)
          .eq('timeWindow', args.timeWindow)
          .eq('sort', args.sort),
      )
      .collect()

    const sorted = snapshots.sort((left, right) => left.rank - right.rank)
    const start = (page - 1) * 20

    return {
      items: sorted.slice(start, start + 20),
      total: sorted.length,
      page,
      totalPages: Math.ceil(sorted.length / 20),
    }
  },
})

export const rebuildSnapshots = internalMutation({
  args: {},
  handler: async (ctx) => {
    const projects = (await ctx.db.query('projects').collect()).filter(
      (project) => project.locatic.isVisible,
    )
    const existingSnapshots = await ctx.db.query('pulse_snapshots').collect()
    await Promise.all(
      existingSnapshots.map((snapshot) => ctx.db.delete(snapshot._id)),
    )

    const windows: Array<'day' | 'week' | 'month'> = ['day', 'week', 'month']
    const sorts: Array<'locatic_likes' | 'comments' | 'github_stars'> = [
      'locatic_likes',
      'comments',
      'github_stars',
    ]
    const now = Date.now()

    for (const timeWindow of windows) {
      for (const sort of sorts) {
        const globalRows = buildPulseSnapshotRows({
          scopeType: 'global',
          scopeId: null,
          timeWindow,
          sort,
          projects: projects.map((project) => ({
            projectId: String(project._id),
            projectSnapshot: {
              name: project.github.name,
              fullName: project.github.fullName,
              description: project.github.description,
              primaryLanguage: project.github.primaryLanguage,
              likesCount: project.locatic.likesCount,
              commentsCount: project.locatic.commentsCount,
              stargazersCount: project.github.stargazersCount,
              ownerId: project.ownerId,
              ownerDisplayName: project.ownerSnapshot.displayName,
              ownerAvatarUrl: project.ownerSnapshot.avatarUrl,
              cityId: project.ownerSnapshot.cityId,
              cityName: project.ownerSnapshot.cityName ?? null,
            },
            likesCount: project.locatic.likesCount,
            commentsCount: project.locatic.commentsCount,
            stargazersCount: project.github.stargazersCount,
          })),
          computedAt: now,
        })

        await Promise.all(
          globalRows.map((row) =>
            ctx.db.insert('pulse_snapshots', {
              ...row,
              projectSnapshot: {
                ...row.projectSnapshot,
                cityId: row.projectSnapshot.cityId ?? null,
              },
            }),
          ),
        )
      }
    }

    return { rebuiltAt: now, projects: projects.length }
  },
})
