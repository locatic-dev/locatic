import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  fixtureClerkId,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'

/**
 * Private saves (plan item D1): a saved list is readable only by the user who
 * saved it, save and unsave are idempotent so toggling twice leaves no row,
 * and the card-state query is bounded.
 */

const modules = import.meta.glob('./**/*.ts')
const firstPage = { numItems: 20, cursor: null }
/** `getSavedState` limit in convex/projects.ts (one page of cards). */
const SAVED_STATE_MAX_IDS = 40

type T = TestConvex<typeof schema>

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

async function seedWorld() {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  const ada = await seedUser(t, { username: 'ada' })
  const grace = await seedUser(t, { username: 'grace' })
  const owner = await seedUser(t, { username: 'linus' })
  const kernel = await seedProject(t, { ownerId: owner, name: 'kernel' })
  const git = await seedProject(t, { ownerId: owner, name: 'git' })
  return { t, ada, grace, owner, kernel, git }
}

async function countRows(t: T, userId: Id<'users'>) {
  return await t.run(
    async (ctx) =>
      (
        await ctx.db
          .query('saved_projects')
          .withIndex('by_user_created', (query) => query.eq('userId', userId))
          .collect()
      ).length,
  )
}

describe('saves', () => {
  it('lists a saved project for its owner only', async () => {
    const { t, ada, kernel } = await seedWorld()
    await as(t, 'ada').mutation(api.projects.save, { projectId: kernel })

    const adaPage = await as(t, 'ada').query(api.projects.listSaved, {
      paginationOpts: firstPage,
    })
    expect(adaPage.page.map((entry) => entry.project.fullName)).toEqual([
      'linus/kernel',
    ])

    // Another signed-in user reads their own (empty) range, never Ada's.
    const gracePage = await as(t, 'grace').query(api.projects.listSaved, {
      paginationOpts: firstPage,
    })
    expect(gracePage.page).toEqual([])
    expect(gracePage.isDone).toBe(true)

    // Signed-out callers are rejected.
    await expect(
      t.query(api.projects.listSaved, { paginationOpts: firstPage }),
    ).rejects.toThrow(/Unauthorized/)

    expect(await countRows(t, ada)).toBe(1)
  })

  it('does not reveal saved state to other users', async () => {
    const { t, kernel, git } = await seedWorld()
    await as(t, 'ada').mutation(api.projects.save, { projectId: kernel })

    expect(
      await as(t, 'ada').query(api.projects.getSavedState, {
        projectIds: [kernel, git],
      }),
    ).toEqual([kernel])
    expect(
      await as(t, 'grace').query(api.projects.getSavedState, {
        projectIds: [kernel, git],
      }),
    ).toEqual([])
    expect(
      await t.query(api.projects.getSavedState, { projectIds: [kernel] }),
    ).toEqual([])
  })

  it('leaves no row after save then unsave, and repeats are no-ops', async () => {
    const { t, ada, kernel } = await seedWorld()
    const viewer = as(t, 'ada')

    await viewer.mutation(api.projects.save, { projectId: kernel })
    await viewer.mutation(api.projects.save, { projectId: kernel })
    expect(await countRows(t, ada)).toBe(1)

    await viewer.mutation(api.projects.unsave, { projectId: kernel })
    expect(await countRows(t, ada)).toBe(0)
    await viewer.mutation(api.projects.unsave, { projectId: kernel })
    expect(await countRows(t, ada)).toBe(0)

    expect(
      (
        await viewer.query(api.projects.listSaved, {
          paginationOpts: firstPage,
        })
      ).page,
    ).toEqual([])
  })

  it('orders by most recently saved and skips projects hidden later', async () => {
    const { t, kernel, git } = await seedWorld()
    const viewer = as(t, 'ada')
    await viewer.mutation(api.projects.save, { projectId: kernel })
    await viewer.mutation(api.projects.save, { projectId: git })

    const page = await viewer.query(api.projects.listSaved, {
      paginationOpts: firstPage,
    })
    expect(page.page.map((entry) => entry.project.repo)).toEqual([
      'git',
      'kernel',
    ])

    await t.run(async (ctx) => {
      const project = await ctx.db.get(git)
      if (!project) throw new Error('missing project')
      await ctx.db.patch(git, {
        locatic: { ...project.locatic, isVisible: false },
      })
    })
    const afterHide = await viewer.query(api.projects.listSaved, {
      paginationOpts: firstPage,
    })
    expect(afterHide.page.map((entry) => entry.project.repo)).toEqual([
      'kernel',
    ])
  })

  it('refuses to save hidden projects or without signing in', async () => {
    const { t, owner, kernel } = await seedWorld()
    const hidden = await seedProject(t, {
      ownerId: owner,
      name: 'secret',
      isVisible: false,
    })

    await expect(
      as(t, 'ada').mutation(api.projects.save, { projectId: hidden }),
    ).rejects.toThrow(/Project not found/)
    await expect(
      t.mutation(api.projects.save, { projectId: kernel }),
    ).rejects.toThrow(/Unauthorized/)
  })

  it('bounds the card-state query', async () => {
    const { t, owner, kernel } = await seedWorld()
    const projectIds: Id<'projects'>[] = [kernel]
    for (let index = 1; index <= SAVED_STATE_MAX_IDS; index += 1) {
      projectIds.push(
        await seedProject(t, { ownerId: owner, name: `repo-${index}` }),
      )
    }

    await expect(
      as(t, 'ada').query(api.projects.getSavedState, { projectIds }),
    ).rejects.toThrow(/at most 40/)
    expect(
      await as(t, 'ada').query(api.projects.getSavedState, {
        projectIds: projectIds.slice(0, SAVED_STATE_MAX_IDS),
      }),
    ).toEqual([])
  })
})
