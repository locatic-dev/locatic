import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import {
  recomputeContributionCountsForUsers,
  runProjectContributorSyncTargets,
} from '../project_contributor_sync'

function userId(id: string) {
  return id as Id<'users'>
}

function projectId(id: string) {
  return id as Id<'projects'>
}

function contributorId(id: string) {
  return id as Id<'project_contributors'>
}

function createContributionCountCtx(args: {
  contributions: Array<{
    _id: Id<'project_contributors'>
    isActive: boolean
    projectId: Id<'projects'>
    userId: Id<'users'>
  }>
  projects: Map<
    Id<'projects'>,
    { _id: Id<'projects'>; locatic: { isVisible: boolean } }
  >
  users: Map<
    Id<'users'>,
    {
      _id: Id<'users'>
      stats: {
        commentsCount: number
        contributionsCount: number
        followersCount: number
        followingCount: number
        likesGivenCount: number
        postsCount: number
        projectsCount: number
      }
    }
  >
}) {
  const userPatches: Array<{
    patch: { stats: { contributionsCount: number }; updatedAt: number }
    userId: Id<'users'>
  }> = []

  const ctx = {
    db: {
      get: async (id: Id<'users'> | Id<'projects'>) =>
        args.users.get(id as Id<'users'>) ??
        args.projects.get(id as Id<'projects'>) ??
        null,
      patch: async (
        id: Id<'users'>,
        patch: { stats: { contributionsCount: number }; updatedAt: number },
      ) => {
        userPatches.push({ patch, userId: id })
      },
      query: (table: string) => {
        expect(table).toBe('project_contributors')
        return {
          withIndex: (
            indexName: string,
            buildQuery: (query: {
              eq: (
                field: string,
                value: boolean | Id<'users'>,
              ) => {
                eq: (field: string, value: boolean | Id<'users'>) => unknown
              }
            }) => unknown,
          ) => {
            expect(indexName).toBe('by_user_active_confirmed')
            const constraints = new Map<string, boolean | Id<'users'>>()
            const query = {
              eq: (field: string, value: boolean | Id<'users'>) => {
                constraints.set(field, value)
                return query
              },
            }
            buildQuery(query)

            return {
              collect: async () =>
                args.contributions.filter(
                  (contribution) =>
                    contribution.userId === constraints.get('userId') &&
                    contribution.isActive === constraints.get('isActive'),
                ),
            }
          },
        }
      },
    },
  } as unknown as MutationCtx

  return { ctx, userPatches }
}

describe('recomputeContributionCountsForUsers', () => {
  it('counts only active contributions whose projects are still visible', async () => {
    const aliceId = userId('alice')
    const users = new Map([
      [
        aliceId,
        {
          _id: aliceId,
          stats: {
            commentsCount: 0,
            contributionsCount: 99,
            followersCount: 0,
            followingCount: 0,
            likesGivenCount: 0,
            postsCount: 0,
            projectsCount: 0,
          },
        },
      ],
    ])
    const projects = new Map([
      [
        projectId('visible-project'),
        {
          _id: projectId('visible-project'),
          locatic: { isVisible: true },
        },
      ],
      [
        projectId('hidden-project'),
        {
          _id: projectId('hidden-project'),
          locatic: { isVisible: false },
        },
      ],
    ])
    const { ctx, userPatches } = createContributionCountCtx({
      contributions: [
        {
          _id: contributorId('visible-contribution'),
          isActive: true,
          projectId: projectId('visible-project'),
          userId: aliceId,
        },
        {
          _id: contributorId('hidden-contribution'),
          isActive: true,
          projectId: projectId('hidden-project'),
          userId: aliceId,
        },
        {
          _id: contributorId('missing-project-contribution'),
          isActive: true,
          projectId: projectId('missing-project'),
          userId: aliceId,
        },
        {
          _id: contributorId('inactive-contribution'),
          isActive: false,
          projectId: projectId('visible-project'),
          userId: aliceId,
        },
      ],
      projects,
      users,
    })

    await recomputeContributionCountsForUsers(ctx, [aliceId], 123)

    expect(userPatches).toEqual([
      {
        patch: {
          stats: {
            commentsCount: 0,
            contributionsCount: 1,
            followersCount: 0,
            followingCount: 0,
            likesGivenCount: 0,
            postsCount: 0,
            projectsCount: 0,
          },
          updatedAt: 123,
        },
        userId: aliceId,
      },
    ])
  })
})

describe('runProjectContributorSyncTargets', () => {
  it('returns a summary for synced and failed project targets', async () => {
    const failedProjectId = projectId('failed-project')

    const summary = await runProjectContributorSyncTargets({
      getErrorMessage: (error) =>
        error instanceof Error ? error.message : 'unknown',
      refreshAll: true,
      runSync: async (targetProjectId) => {
        if (targetProjectId === failedProjectId) {
          throw new Error('GitHub unavailable')
        }
      },
      scanned: 3,
      targets: [
        {
          fullName: 'owner/synced',
          projectId: projectId('synced-project'),
        },
        {
          fullName: 'owner/failed',
          projectId: failedProjectId,
        },
      ],
    })

    expect(summary).toEqual({
      failed: 1,
      refreshAll: true,
      results: [
        {
          error: null,
          fullName: 'owner/synced',
          projectId: projectId('synced-project'),
          status: 'synced',
        },
        {
          error: 'GitHub unavailable',
          fullName: 'owner/failed',
          projectId: failedProjectId,
          status: 'failed',
        },
      ],
      scanned: 3,
      synced: 1,
      targets: 2,
    })
  })
})
