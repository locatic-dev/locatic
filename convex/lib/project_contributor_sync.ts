import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

export type ProjectContributorSyncTarget = {
  fullName: string
  projectId: Id<'projects'>
}

type ProjectContributorSyncResult = ProjectContributorSyncTarget & {
  error: string | null
  status: 'failed' | 'synced'
}

export type ProjectContributorSyncSummary = {
  failed: number
  refreshAll: boolean
  results: ProjectContributorSyncResult[]
  scanned: number
  synced: number
  targets: number
}

export const projectContributorSyncResultValidator = v.object({
  error: v.union(v.string(), v.null()),
  fullName: v.string(),
  projectId: v.id('projects'),
  status: v.union(v.literal('failed'), v.literal('synced')),
})

export const projectContributorSyncSummaryValidator = v.object({
  failed: v.number(),
  refreshAll: v.boolean(),
  results: v.array(projectContributorSyncResultValidator),
  scanned: v.number(),
  synced: v.number(),
  targets: v.number(),
})

export async function runProjectContributorSyncTargets(args: {
  getErrorMessage: (error: unknown) => string
  logFailure?: (target: ProjectContributorSyncTarget, message: string) => void
  refreshAll: boolean
  runSync: (projectId: Id<'projects'>) => Promise<unknown>
  scanned: number
  targets: ProjectContributorSyncTarget[]
}): Promise<ProjectContributorSyncSummary> {
  const results: ProjectContributorSyncResult[] = []

  for (const target of args.targets) {
    try {
      await args.runSync(target.projectId)
      results.push({
        error: null,
        fullName: target.fullName,
        projectId: target.projectId,
        status: 'synced',
      })
    } catch (error) {
      const message = args.getErrorMessage(error)
      args.logFailure?.(target, message)
      results.push({
        error: message,
        fullName: target.fullName,
        projectId: target.projectId,
        status: 'failed',
      })
    }
  }

  return {
    failed: results.filter((result) => result.status === 'failed').length,
    refreshAll: args.refreshAll,
    results,
    scanned: args.scanned,
    synced: results.filter((result) => result.status === 'synced').length,
    targets: args.targets.length,
  }
}

export async function recomputeContributionCountsForUsers(
  ctx: MutationCtx,
  userIds: Iterable<Id<'users'>>,
  now = Date.now(),
) {
  for (const userId of new Set(userIds)) {
    const user = await ctx.db.get(userId)
    if (!user) {
      continue
    }

    const activeContributions = await ctx.db
      .query('project_contributors')
      .withIndex('by_user_active_confirmed', (query) =>
        query.eq('userId', user._id).eq('isActive', true),
      )
      .collect()
    let visibleContributionsCount = 0

    for (const contribution of activeContributions) {
      const project = await ctx.db.get(contribution.projectId)
      if (project?.locatic.isVisible) {
        visibleContributionsCount += 1
      }
    }

    await ctx.db.patch(user._id, {
      stats: {
        ...user.stats,
        contributionsCount: visibleContributionsCount,
      },
      updatedAt: now,
    })
  }
}
