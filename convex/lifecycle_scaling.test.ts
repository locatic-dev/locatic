import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'
import {
  BENGALURU,
  NOW,
  fixtureClerkId,
  seedCity,
  seedPost,
  seedProject,
  seedUser,
  finishLifecycleOwnerSync,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())

it('commits deletion immediately and processes a large account in resumable bounded pages', async () => {
  const t = convexTest(schema, modules)
  const city = await seedCity(t, BENGALURU)
  const userId = await seedUser(t, { username: 'owner', cityId: city })
  const projects: Id<'projects'>[] = []
  for (let index = 0; index < 56; index++)
    projects.push(
      await seedProject(t, { ownerId: userId, name: `repo-${index}` }),
    )
  await t.run((ctx) =>
    ctx.db.patch(city, {
      stats: { builderCount: 1, projectCount: 56, lastActivityAt: NOW },
    }),
  )
  const client = t.withIdentity({ subject: fixtureClerkId('owner') })
  await client.mutation(api.users.deleteAccount, {})
  const unchanged = await t.run(async (ctx) =>
    Promise.all(projects.map((id) => ctx.db.get(id))),
  )
  expect(unchanged.every((project) => project!.exploreOwner.isEligible)).toBe(
    true,
  )
  expect(
    await t.query(api.users.publicProfileOverview, { username: 'owner' }),
  ).toBeNull()
  expect(
    await t.query(api.projects.getPublicByRoute, {
      owner: 'owner',
      repo: 'repo-0',
    }),
  ).toBeNull()
  const initial = (await t.run((ctx) => ctx.db.get(userId)))!
    .lifecycleOwnerSync!
  expect(initial).toMatchObject({ generation: 1, stage: 0, cursor: null })
  const queued = () =>
    t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect())
        .filter((job) => job.name.endsWith('syncLifecycleOwnerStatePage'))
        .map((job) => job.args[0]),
    )
  expect(await queued()).toContainEqual({ userId, ...initial })
  const args = { userId, ...initial }
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, args)
  const afterOne = await t.run(async (ctx) =>
    Promise.all(projects.map((id) => ctx.db.get(id))),
  )
  expect(
    afterOne.filter((project) => !project!.exploreOwner.isEligible).length,
  ).toBe(25)
  const counter = (await t.run((ctx) => ctx.db.get(city)))!.stats
  expect(counter?.projectCount).toBe(31)
  const continuation = (await t.run((ctx) => ctx.db.get(userId)))!
    .lifecycleOwnerSync!
  expect(await queued()).toContainEqual({ userId, ...continuation })
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, args)
  expect((await t.run((ctx) => ctx.db.get(city)))!.stats).toEqual(counter)
  for (let index = 0; index < 30; index++) {
    const state = (await t.run((ctx) => ctx.db.get(userId)))!
      .lifecycleOwnerSync!
    if (state.stage === 3) break
    await t.mutation(internal.users.syncLifecycleOwnerStatePage, {
      userId,
      ...state,
    })
  }
  expect((await t.run((ctx) => ctx.db.get(city)))!.stats).toMatchObject({
    builderCount: 0,
    projectCount: 0,
  })
  expect(
    (await t.run((ctx) => ctx.db.get(userId)))!.lifecycleOwnerSync!.stage,
  ).toBe(3)
})

it('removes a builder from city counts when deletion occurs at the Unix epoch', async () => {
  const t = convexTest(schema, modules)
  const city = await seedCity(t, BENGALURU)
  const owner = await seedUser(t, { username: 'owner', cityId: city })
  await t.run((ctx) =>
    ctx.db.patch(city, {
      stats: { builderCount: 1, projectCount: 0, lastActivityAt: null },
    }),
  )
  vi.setSystemTime(0)
  await t
    .withIdentity({ subject: fixtureClerkId('owner') })
    .mutation(api.users.deleteAccount, {})
  expect((await t.run((ctx) => ctx.db.get(city)))!.stats?.builderCount).toBe(0)
  expect((await t.run((ctx) => ctx.db.get(owner)))!.deletedAt).toBe(0)
})

it('cancels a consumed deletion page after restore and restores every project without double counting', async () => {
  const t = convexTest(schema, modules)
  const city = await seedCity(t, BENGALURU)
  const userId = await seedUser(t, { username: 'owner', cityId: city })
  for (let index = 0; index < 31; index++)
    await seedProject(t, { ownerId: userId, name: `repo-${index}` })
  await t.run((ctx) =>
    ctx.db.patch(city, {
      stats: { builderCount: 1, projectCount: 31, lastActivityAt: NOW },
    }),
  )
  const client = t.withIdentity({ subject: fixtureClerkId('owner') })
  await client.mutation(api.users.deleteAccount, {})
  const deletion = (await t.run((ctx) => ctx.db.get(userId)))!
    .lifecycleOwnerSync!
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, {
    userId,
    ...deletion,
  })
  const oldJob = (await t.run((ctx) => ctx.db.get(userId)))!.lifecycleOwnerSync!
  await client.mutation(api.users.restoreAccount, {})
  const restored = await t.run((ctx) => ctx.db.get(userId))
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, {
    userId,
    ...oldJob,
  })
  expect(await t.run((ctx) => ctx.db.get(userId))).toEqual(restored)
  for (let index = 0; index < 20; index++) {
    const state = (await t.run((ctx) => ctx.db.get(userId)))!
      .lifecycleOwnerSync!
    if (state.stage === 3) break
    await t.mutation(internal.users.syncLifecycleOwnerStatePage, {
      userId,
      ...state,
    })
  }
  expect((await t.run((ctx) => ctx.db.get(city)))!.stats).toMatchObject({
    builderCount: 1,
    projectCount: 31,
  })
})

it('pages owned and independently authored posts, preserving the foreign owner’s location', async () => {
  const t = convexTest(schema, modules)
  const city = await seedCity(t, BENGALURU)
  const owner = await seedUser(t, { username: 'owner', cityId: city })
  const other = await seedUser(t, { username: 'other', cityId: city })
  const ownProject = await seedProject(t, { ownerId: owner, name: 'own' })
  const foreignProject = await seedProject(t, {
    ownerId: other,
    name: 'foreign',
  })
  const ownPosts: Id<'posts'>[] = [],
    foreignPosts: Id<'posts'>[] = []
  for (let index = 0; index < 31; index++) {
    ownPosts.push(await seedPost(t, ownProject, other, NOW + index))
    foreignPosts.push(await seedPost(t, foreignProject, owner, NOW + index))
  }
  const client = t.withIdentity({ subject: fixtureClerkId('owner') })
  await client.mutation(api.users.deleteAccount, {})
  await finishLifecycleOwnerSync(t, owner)
  const read = () =>
    t.run(async (ctx) => ({
      owned: await Promise.all(ownPosts.map((id) => ctx.db.get(id))),
      foreign: await Promise.all(foreignPosts.map((id) => ctx.db.get(id))),
    }))
  const deleted = await read()
  expect(deleted.owned.every((post) => post!.projectCityId === null)).toBe(true)
  expect(
    deleted.foreign.every(
      (post) =>
        post!.actorSnapshot.cityId === null && post!.projectCityId === city,
    ),
  ).toBe(true)
  await client.mutation(api.users.restoreAccount, {})
  await finishLifecycleOwnerSync(t, owner)
  const restored = await read()
  expect(restored.owned.every((post) => post!.projectCityId === city)).toBe(
    true,
  )
  expect(
    restored.foreign.every(
      (post) =>
        post!.actorSnapshot.cityId === city && post!.projectCityId === city,
    ),
  ).toBe(true)
})

it('does not apply a queued lifecycle page after purge becomes due', async () => {
  const t = convexTest(schema, modules)
  const owner = await seedUser(t, { username: 'owner' })
  const client = t.withIdentity({ subject: fixtureClerkId('owner') })
  await client.mutation(api.users.deleteAccount, {})
  const before = (await t.run((ctx) => ctx.db.get(owner)))!
  vi.setSystemTime(before.purgeAfter!)
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, {
    userId: owner,
    ...before.lifecycleOwnerSync!,
  })
  expect(await t.run((ctx) => ctx.db.get(owner))).toEqual(before)
})

it('does not let a stale restore job reopen a newly deleted account', async () => {
  const t = convexTest(schema, modules)
  const owner = await seedUser(t, { username: 'owner' })
  const project = await seedProject(t, { ownerId: owner, name: 'repo' })
  const client = t.withIdentity({ subject: fixtureClerkId('owner') })
  await client.mutation(api.users.deleteAccount, {})
  await finishLifecycleOwnerSync(t, owner)
  await client.mutation(api.users.restoreAccount, {})
  const restoreJob = (await t.run((ctx) => ctx.db.get(owner)))!
    .lifecycleOwnerSync!
  await client.mutation(api.users.deleteAccount, {})
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, {
    userId: owner,
    ...restoreJob,
  })
  expect(
    (await t.run((ctx) => ctx.db.get(project)))!.exploreOwner.isActive,
  ).toBe(false)
  expect(
    (await t.run((ctx) => ctx.db.get(owner)))!.lifecycleOwnerSync!.generation,
  ).toBe(3)
})
