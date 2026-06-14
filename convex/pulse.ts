import { v } from 'convex/values'

import { internalMutation, query } from './_generated/server'
import { buildPulseSnapshotRows } from './lib/pulse'
import { resolveProjectOwnerLogin } from './lib/project_route'

function getWindowStart(now: number, timeWindow: 'day' | 'week' | 'month') {
  switch (timeWindow) {
    case 'day':
      return now - 24 * 60 * 60 * 1000
    case 'week':
      return now - 7 * 24 * 60 * 60 * 1000
    case 'month':
    default:
      return now - 30 * 24 * 60 * 60 * 1000
  }
}

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
    const [projects, users, reactions, comments, existingSnapshots] =
      await Promise.all([
        ctx.db.query('projects').collect(),
        ctx.db.query('users').collect(),
        ctx.db.query('reactions').withIndex('by_user').collect(),
        ctx.db.query('comments').collect(),
        ctx.db.query('pulse_snapshots').collect(),
      ])

    const usersById = new Map(users.map((user) => [String(user._id), user]))
    const visibleProjects = projects.filter((project) => {
      if (!project.locatic.isVisible) {
        return false
      }

      const owner = usersById.get(String(project.ownerId))
      if (!owner || owner.deletedAt || owner.deactivatedAt) {
        return false
      }

      return owner.privacy.appearInPulse
    })

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
      const windowStart = getWindowStart(now, timeWindow)
      const likesByProjectId = new Map<string, number>()
      const commentsByProjectId = new Map<string, number>()
      const activeProjectIds = new Set<string>()

      for (const reaction of reactions) {
        if (
          reaction.targetType !== 'project' ||
          reaction.reactionType !== 'like' ||
          reaction.createdAt < windowStart
        ) {
          continue
        }

        likesByProjectId.set(
          reaction.targetId,
          (likesByProjectId.get(reaction.targetId) ?? 0) + 1,
        )
        activeProjectIds.add(reaction.targetId)
      }

      for (const comment of comments) {
        if (
          comment.targetType !== 'project' ||
          comment.isDeleted ||
          comment.createdAt < windowStart
        ) {
          continue
        }

        commentsByProjectId.set(
          comment.targetId,
          (commentsByProjectId.get(comment.targetId) ?? 0) + 1,
        )
        activeProjectIds.add(comment.targetId)
      }

      for (const project of visibleProjects) {
        if (
          project.addedToLocaticAt >= windowStart ||
          project.github.lastCommitAt >= windowStart
        ) {
          activeProjectIds.add(String(project._id))
        }
      }

      const scopedProjects =
        activeProjectIds.size > 0
          ? visibleProjects.filter((project) =>
              activeProjectIds.has(String(project._id)),
            )
          : visibleProjects

      for (const sort of sorts) {
        const pulseInputs = scopedProjects.map((project) => ({
          projectId: String(project._id),
          projectSnapshot: {
            name: project.github.name,
            fullName: project.github.fullName,
            ownerLogin: resolveProjectOwnerLogin(project),
            description: project.github.description,
            primaryLanguage: project.github.primaryLanguage,
            languages: project.github.languages,
            likesCount: likesByProjectId.get(String(project._id)) ?? 0,
            commentsCount: commentsByProjectId.get(String(project._id)) ?? 0,
            stargazersCount: project.github.stargazersCount,
            ownerId: project.ownerId,
            ownerDisplayName: project.ownerSnapshot.displayName,
            ownerAvatarUrl: project.ownerSnapshot.avatarUrl,
            cityId: project.ownerSnapshot.cityId,
            cityName: project.ownerSnapshot.cityName ?? null,
          },
          likesCount: likesByProjectId.get(String(project._id)) ?? 0,
          commentsCount: commentsByProjectId.get(String(project._id)) ?? 0,
          stargazersCount: project.github.stargazersCount,
        }))

        const globalRows = buildPulseSnapshotRows({
          scopeType: 'global',
          scopeId: null,
          timeWindow,
          sort,
          projects: pulseInputs,
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

        const cityIds = new Set(
          pulseInputs
            .map((project) => project.projectSnapshot.cityId)
            .filter(Boolean)
            .map((cityId) => String(cityId)),
        )

        for (const cityId of cityIds) {
          const cityRows = buildPulseSnapshotRows({
            scopeType: 'city',
            scopeId: cityId,
            timeWindow,
            sort,
            projects: pulseInputs.filter(
              (project) => String(project.projectSnapshot.cityId) === cityId,
            ),
            computedAt: now,
          })

          await Promise.all(
            cityRows.map((row) =>
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
    }

    return { rebuiltAt: now, projects: visibleProjects.length }
  },
})
