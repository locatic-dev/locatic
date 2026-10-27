import { convexTest, type TestConvex } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  NOW,
  daysAgo,
  fixtureClerkId,
  seedCities,
  seedPopulatedCity,
  seedPost,
  seedPrivacyVariants,
  seedProject,
  seedUser,
  finishLifecycleOwnerSync,
  type PopulatedCityFixture,
} from './__tests__/fixtures.helpers'
import {
  EXPLORE_AUTO_FETCH_LIMIT,
  getExploreBrowsePhase,
  requestExploreContinuation,
  settleExploreContinuation,
  shouldAutoAdvanceExploreFeed,
  startExploreContinuation,
} from '../src/features/explore/feed-state'
import { EXPLORE_PAGINATED_PAGE_SIZE } from '../src/features/explore/pagination'

const modules = import.meta.glob('./**/*.ts')

const PAGE = { numItems: 50, cursor: null }
const resetDismissedProjectsBatch = makeFunctionReference<
  'mutation',
  { userId: Id<'users'>; requestedAt: number },
  null
>('explore:resetDismissedProjectsBatch')
const resetDismissedPostsBatch = makeFunctionReference<
  'mutation',
  { userId: Id<'users'>; requestedAt: number },
  null
>('explore:resetDismissedPostsBatch')

function as(t: TestConvex<typeof schema>, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

async function builders(
  t: TestConvex<typeof schema>,
  viewer: string,
  cityIds: Array<Id<'cities'>>,
) {
  const result = await as(t, viewer).query(api.explore.listNearbyBuilders, {
    cityIds,
    paginationOpts: PAGE,
  })
  return result.page
}

async function projectIds(
  t: TestConvex<typeof schema>,
  viewer: string,
  selectedCityIds: Array<Id<'cities'>> | null,
) {
  const result = await as(t, viewer).query(
    api.explore.list,
    selectedCityIds
      ? { paginationOpts: PAGE, scope: 'custom', selectedCityIds }
      : { paginationOpts: PAGE, scope: 'global' },
  )
  return result.page.map((project) => project.projectId)
}

async function postIds(
  t: TestConvex<typeof schema>,
  viewer: string,
  selectedCityIds: Array<Id<'cities'>> | null,
) {
  const result = await as(t, viewer).query(
    api.explore.listPosts,
    selectedCityIds
      ? { paginationOpts: PAGE, scope: 'custom', selectedCityIds }
      : { paginationOpts: PAGE, scope: 'global' },
  )
  return result.page.map((post) => post._id)
}

function ids<T extends { userId: Id<'users'> }>(page: T[]) {
  return page.map((builder) => builder.userId).sort()
}

describe('explore visibility contract', () => {
  let t: TestConvex<typeof schema>
  let fixture: PopulatedCityFixture

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    fixture = await seedPopulatedCity(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists only exact-city members in city-scoped builders', async () => {
    const { bengaluru, hyderabad } = fixture.cities
    const { alice, bob, carol, frank } = fixture.users

    const bengaluruBuilders = await builders(t, 'frank', [bengaluru])
    expect(ids(bengaluruBuilders)).toEqual([alice, bob, carol].sort())
    for (const builder of bengaluruBuilders) {
      expect(builder.location).toMatchObject({
        kind: 'city',
        cityId: bengaluru,
        cityName: 'Bengaluru, Karnataka, India',
      })
    }

    // Multi-city scope goes through the global index; same membership rule.
    expect(ids(await builders(t, 'alice', [bengaluru, hyderabad]))).toEqual(
      [bob, carol, frank].sort(),
    )
  })

  it('returns a region label and no city id for region-only builders, and nothing for hidden ones', async () => {
    const { dev, erin } = fixture.users

    const globalBuilders = await builders(t, 'frank', [])
    const devEntry = globalBuilders.find((builder) => builder.userId === dev)
    const erinEntry = globalBuilders.find((builder) => builder.userId === erin)

    expect(devEntry?.location).toEqual({
      kind: 'region',
      regionLabel: 'Karnataka, India',
    })
    expect(erinEntry?.location).toEqual({ kind: 'none' })
    for (const entry of [devEntry, erinEntry]) {
      expect(entry).toBeDefined()
      expect(entry).not.toHaveProperty('cityId')
      expect(entry).not.toHaveProperty('cityName')
      expect(entry!.location).not.toHaveProperty('cityId')
      expect(JSON.stringify(entry)).not.toContain('Bengaluru')
    }
  })

  it('keeps discovery participation separate from location visibility', async () => {
    const { bengaluru } = fixture.cities
    const variants = await seedPrivacyVariants(t, bengaluru)

    const globalIds = new Set(ids(await builders(t, 'frank', [])))
    const cityIds = new Set(ids(await builders(t, 'frank', [bengaluru])))

    // appearInExplore true: in global discovery whatever the location setting.
    expect(globalIds.has(variants.users['exact_city:explore'])).toBe(true)
    expect(globalIds.has(variants.users['region_only:explore'])).toBe(true)
    expect(globalIds.has(variants.users['hidden:explore'])).toBe(true)
    // Only exact-city participants are listed for the city.
    expect(cityIds.has(variants.users['exact_city:explore'])).toBe(true)
    expect(cityIds.has(variants.users['region_only:explore'])).toBe(false)
    expect(cityIds.has(variants.users['hidden:explore'])).toBe(false)
    // appearInExplore false: nowhere in discovery.
    for (const key of [
      'exact_city:noExplore',
      'region_only:noExplore',
      'hidden:noExplore',
    ] as const) {
      expect(globalIds.has(variants.users[key])).toBe(false)
      expect(cityIds.has(variants.users[key])).toBe(false)
    }

    const hiddenEntry = (await builders(t, 'frank', [])).find(
      (builder) => builder.userId === variants.users['hidden:explore'],
    )
    expect(hiddenEntry?.location).toEqual({ kind: 'none' })

    // Global projects follow participation; city projects follow membership.
    const globalProjects = new Set(await projectIds(t, 'frank', null))
    const cityProjects = new Set(await projectIds(t, 'frank', [bengaluru]))
    expect(globalProjects.has(variants.projects['hidden:explore'])).toBe(true)
    expect(globalProjects.has(variants.projects['hidden:noExplore'])).toBe(
      false,
    )
    expect(cityProjects.has(variants.projects['exact_city:explore'])).toBe(true)
    expect(cityProjects.has(variants.projects['region_only:explore'])).toBe(
      false,
    )
    expect(cityProjects.has(variants.projects['hidden:explore'])).toBe(false)
  })

  it('applies the member rule to builder search with a city filter', async () => {
    const { bengaluru } = fixture.cities
    const { alice, dev, erin } = fixture.users

    const search = (username: string, cityIds?: Array<Id<'cities'>>) =>
      as(t, 'frank').query(api.explore.searchBuilders, {
        q: username,
        ...(cityIds ? { cityIds } : {}),
      })

    expect((await search('alice', [bengaluru])).map((b) => b.userId)).toEqual([
      alice,
    ])
    expect(await search('dev', [bengaluru])).toEqual([])
    expect(await search('erin', [bengaluru])).toEqual([])
    // Without a city filter the participants are still findable.
    expect((await search('dev')).map((b) => b.userId)).toEqual([dev])
    expect((await search('erin')).map((b) => b.userId)).toEqual([erin])
  })

  it('excludes non-member owners from city-scoped project and post feeds but keeps them global', async () => {
    const { bengaluru } = fixture.cities
    const { projects, posts } = fixture

    expect((await projectIds(t, 'frank', [bengaluru])).sort()).toEqual(
      [
        projects.aliceApp,
        projects.aliceLib,
        projects.bobCli,
        projects.carolEngine,
      ].sort(),
    )
    expect(await postIds(t, 'frank', [bengaluru])).toEqual([posts.bobCli])

    const globalProjects = await as(t, 'frank').query(api.explore.list, {
      paginationOpts: PAGE,
      scope: 'global',
    })
    const devProject = globalProjects.page.find(
      (project) => project.projectId === projects.devTool,
    )
    const erinProject = globalProjects.page.find(
      (project) => project.projectId === projects.erinService,
    )
    expect(devProject?.cityLabel).toBe('Karnataka, India')
    expect(erinProject?.cityLabel).toBeNull()

    const globalPosts = await as(t, 'frank').query(api.explore.listPosts, {
      paginationOpts: PAGE,
      scope: 'global',
    })
    const devPost = globalPosts.page.find((post) => post._id === posts.devTool)
    const erinPost = globalPosts.page.find(
      (post) => post._id === posts.erinService,
    )
    expect(devPost).toMatchObject({
      projectCityId: null,
      actorSnapshot: { cityId: null, cityName: 'Karnataka, India' },
    })
    expect(erinPost).toMatchObject({
      projectCityId: null,
      actorSnapshot: { cityId: null, cityName: null },
    })
  })

  it('re-derives maintained data when the viewer changes their own city visibility', async () => {
    const { bengaluru } = fixture.cities
    const { alice } = fixture.users
    const { aliceApp, aliceLib } = fixture.projects
    const alicePost = await seedPost(t, aliceApp, alice, daysAgo(1))

    expect(ids(await builders(t, 'frank', [bengaluru]))).toContain(alice)
    expect(await postIds(t, 'frank', [bengaluru])).toContain(alicePost)

    const aliceSession = as(t, 'alice')
    const privacyArgs = {
      profileVisibility: 'public' as const,
      followGraphVisibility: 'public' as const,
      commentHistoryVisibility: 'public' as const,
      likedProjectsVisibility: 'public' as const,
      contributionsVisibility: 'public' as const,
      appearInPulse: true,
    }
    await aliceSession.mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'hidden',
    })

    expect(ids(await builders(t, 'frank', [bengaluru]))).not.toContain(alice)
    const aliceGlobal = (await builders(t, 'frank', [])).find(
      (builder) => builder.userId === alice,
    )
    expect(aliceGlobal?.location).toEqual({ kind: 'none' })

    const cityProjects = await projectIds(t, 'frank', [bengaluru])
    expect(cityProjects).not.toContain(aliceApp)
    expect(cityProjects).not.toContain(aliceLib)
    expect(await projectIds(t, 'frank', null)).toContain(aliceApp)
    expect(await postIds(t, 'frank', [bengaluru])).not.toContain(alicePost)

    await finishLifecycleOwnerSync(t, alice)
    const stored = await t.run(async (ctx) => ({
      projects: await Promise.all(
        [aliceApp, aliceLib].map((id) => ctx.db.get(id)),
      ),
      post: await ctx.db.get(alicePost),
    }))
    for (const project of stored.projects) {
      expect(project?.exploreOwner).toMatchObject({
        cityId: null,
        isEligible: true,
      })
      expect(project?.ownerSnapshot).toMatchObject({
        cityId: null,
        cityName: null,
      })
    }
    expect(stored.post).toMatchObject({
      projectCityId: null,
      actorSnapshot: { cityId: null, cityName: null },
    })

    // Region-only: still not a member, snapshots carry the region label.
    await aliceSession.mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'region_only',
    })
    await finishLifecycleOwnerSync(t, alice)
    expect(
      await t.run(async (ctx) => (await ctx.db.get(aliceApp))?.ownerSnapshot),
    ).toMatchObject({ cityId: null, cityName: 'Karnataka, India' })
    expect(ids(await builders(t, 'frank', [bengaluru]))).not.toContain(alice)

    // Back to exact city: membership and indexed fields return.
    await aliceSession.mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'exact_city',
    })
    await finishLifecycleOwnerSync(t, alice)
    expect(ids(await builders(t, 'frank', [bengaluru]))).toContain(alice)
    expect(await projectIds(t, 'frank', [bengaluru])).toContain(aliceApp)
    expect(await postIds(t, 'frank', [bengaluru])).toContain(alicePost)
    expect(
      await t.run(async (ctx) => (await ctx.db.get(alicePost))?.projectCityId),
    ).toBe(bengaluru)
  })
})

type PageResult<T> = { page: T[]; isDone: boolean; continueCursor: string }

/** Follows `continueCursor` until `isDone`, one query execution per page. */
async function drain<T>(
  load: (cursor: string | null) => Promise<PageResult<T>>,
  maxCalls = 30,
) {
  const pages: Array<PageResult<T>> = []
  let cursor: string | null = null
  for (;;) {
    const result = await load(cursor)
    pages.push(result)
    if (result.isDone) return pages
    if (pages.length >= maxCalls) {
      throw new Error(`pagination did not finish in ${maxCalls} calls`)
    }
    cursor = result.continueCursor
  }
}

describe('explore pagination contract', () => {
  let t: TestConvex<typeof schema>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    t = convexTest(schema, modules)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const projectPages = (
    viewer: string,
    scope:
      | { scope: 'global' }
      | { scope: 'custom'; selectedCityIds: Array<Id<'cities'>> },
    numItems = 1,
  ) =>
    drain((cursor) =>
      as(t, viewer).query(api.explore.list, {
        ...scope,
        paginationOpts: { numItems, cursor },
      }),
    )

  it('returns an empty, unfinished page when the viewer owns the first project, then continues to the end', async () => {
    const { bengaluru } = await seedCities(t)
    const viewer = await seedUser(t, { username: 'vic', cityId: bengaluru })
    const other = await seedUser(t, { username: 'ola', cityId: bengaluru })
    await seedProject(t, { ownerId: viewer, name: 'mine', lastCommitAt: NOW })
    const newer = await seedProject(t, {
      ownerId: other,
      name: 'newer',
      lastCommitAt: daysAgo(1),
    })
    const middle = await seedProject(t, {
      ownerId: other,
      name: 'middle',
      lastCommitAt: daysAgo(2),
    })
    const older = await seedProject(t, {
      ownerId: other,
      name: 'older',
      lastCommitAt: daysAgo(3),
    })

    const mine = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query('projects')
            .withIndex('by_owner', (query) => query.eq('ownerId', viewer))
            .unique()
        )?._id,
    )

    for (const { scope, lastPage } of [
      { scope: { scope: 'global' as const }, lastPage: [older] },
      // An explicitly selected city lists the viewer's own project after
      // everyone else's, on the page that ends the feed.
      {
        scope: { scope: 'custom' as const, selectedCityIds: [bengaluru] },
        lastPage: [older, mine],
      },
    ]) {
      const pages = await projectPages('vic', scope)

      expect(pages[0]).toMatchObject({ page: [], isDone: false })
      expect(pages[0]?.continueCursor).toEqual(expect.any(String))
      // Three continuations reach the end (convex-test reports `isDone` on
      // the page that reads the last row).
      expect(pages.map((page) => page.isDone)).toEqual([
        false,
        false,
        false,
        true,
      ])
      expect(pages.map((page) => page.page.map((p) => p.projectId))).toEqual([
        [],
        [newer],
        [middle],
        lastPage,
      ])
    }
  })

  it('merges several cities from one index read per page without losing rows', async () => {
    const fixture = await seedPopulatedCity(t)
    const { bengaluru, hyderabad, berlin } = fixture.cities
    const berliner = await seedUser(t, { username: 'bea', cityId: berlin })
    const berlinProject = await seedProject(t, {
      ownerId: berliner,
      name: 'spree',
      lastCommitAt: daysAgo(4),
    })
    const scope = {
      scope: 'custom' as const,
      selectedCityIds: [bengaluru, hyderabad],
    }

    const pages = await projectPages('bea', scope)
    const drained = pages.flatMap((page) =>
      page.page.map((project) => project.projectId),
    )
    const onePage = await as(t, 'bea').query(api.explore.list, {
      ...scope,
      paginationOpts: PAGE,
    })

    const { projects } = fixture
    expect([...drained].sort()).toEqual(
      [
        projects.aliceApp,
        projects.aliceLib,
        projects.bobCli,
        projects.carolEngine,
        projects.frankApi,
      ].sort(),
    )
    expect(drained).not.toContain(berlinProject)
    expect(drained).toEqual(onePage.page.map((project) => project.projectId))
    // Rows outside the selected cities come back as empty, unfinished pages.
    expect(pages.some((page) => page.page.length === 0 && !page.isDone)).toBe(
      true,
    )
  })

  it('drops a project whose live owner left the city without breaking continuation', async () => {
    const fixture = await seedPopulatedCity(t)
    const { bengaluru } = fixture.cities
    const { projects, users } = fixture
    // The stored index field still says Bengaluru; only the live owner changed.
    await t.run(async (ctx) => {
      const bob = await ctx.db.get(users.bob)
      await ctx.db.patch(users.bob, {
        privacy: { ...bob!.privacy, cityVisibility: 'hidden' },
      })
    })
    expect(
      await t.run(
        async (ctx) => (await ctx.db.get(projects.bobCli))?.exploreOwner.cityId,
      ),
    ).toBe(bengaluru)

    const pages = await projectPages('frank', {
      scope: 'custom',
      selectedCityIds: [bengaluru],
    })
    const drained = pages.flatMap((page) =>
      page.page.map((project) => project.projectId),
    )

    expect([...drained].sort()).toEqual(
      [projects.aliceApp, projects.aliceLib, projects.carolEngine].sort(),
    )
    const bobPageIndex = pages.findIndex(
      (page, index) =>
        index < pages.length - 1 && page.page.length === 0 && !page.isDone,
    )
    expect(bobPageIndex).toBeGreaterThan(0)
    expect(pages.at(-1)?.isDone).toBe(true)
  })

  it('pages posts one execution at a time past dismissed and out-of-scope posts', async () => {
    const fixture = await seedPopulatedCity(t)
    const { bengaluru, hyderabad } = fixture.cities
    const { posts } = fixture
    await as(t, 'frank').mutation(api.explore.dismissPost, {
      postId: posts.devTool,
    })

    const postPages = (
      scope:
        | { scope: 'global' }
        | { scope: 'custom'; selectedCityIds: Array<Id<'cities'>> },
    ) =>
      drain((cursor) =>
        as(t, 'frank').query(api.explore.listPosts, {
          ...scope,
          paginationOpts: { numItems: 1, cursor },
        }),
      )

    // devTool is the newest post and frank dismissed it.
    const globalPages = await postPages({ scope: 'global' })
    expect(globalPages[0]).toMatchObject({ page: [], isDone: false })
    expect(
      globalPages.flatMap((page) => page.page.map((post) => post._id)),
    ).toEqual([posts.bobCli, posts.erinService, posts.frankApi])

    // Multi-city: region-only and hidden owners' posts have no city.
    const cityPages = await postPages({
      scope: 'custom',
      selectedCityIds: [bengaluru, hyderabad],
    })
    expect(
      cityPages.flatMap((page) => page.page.map((post) => post._id)),
    ).toEqual([posts.bobCli, posts.frankApi])
    expect(cityPages.at(-1)?.isDone).toBe(true)
  })

  it('keeps dismissed projects out of bounded search results', async () => {
    const fixture = await seedPopulatedCity(t)
    const projectId = fixture.projects.aliceApp
    const search = () =>
      as(t, 'frank').query(api.explore.searchProjects, { q: 'city-notes' })

    expect(
      (await search()).projects.map((project) => project.projectId),
    ).toContain(projectId)

    await as(t, 'frank').mutation(api.explore.dismiss, { projectId })

    const result = await search()

    expect(result.projects.map((project) => project.projectId)).not.toContain(
      projectId,
    )
  })

  it('pages builders one execution at a time past the viewer and non-members', async () => {
    const fixture = await seedPopulatedCity(t)
    const { bengaluru, hyderabad } = fixture.cities
    const { bob, carol, frank } = fixture.users

    const builderPages = (viewer: string, cityIds: Array<Id<'cities'>>) =>
      drain((cursor) =>
        as(t, viewer).query(api.explore.listNearbyBuilders, {
          cityIds,
          paginationOpts: { numItems: 1, cursor },
        }),
      )

    // No fixture builder has public activity yet, so the activity order falls back
    // to newest account first: frank, erin, dev, carol, bob, alice. In
    // Bengaluru erin (hidden) and dev (region only) are not members, so the
    // first page filters to nothing.
    const cityPages = await builderPages('alice', [bengaluru])
    expect(cityPages[0]).toMatchObject({ page: [], isDone: false })
    expect(
      cityPages.flatMap((page) => page.page.map((builder) => builder.userId)),
    ).toEqual([carol, bob])

    // Global: frank is first in order and the viewer here.
    const globalPages = await builderPages('frank', [])
    expect(globalPages[0]).toMatchObject({ page: [], isDone: false })
    expect(
      globalPages.flatMap((page) => page.page.map((builder) => builder.userId)),
    ).not.toContain(frank)

    const multiCityPages = await builderPages('alice', [bengaluru, hyderabad])
    expect(
      multiCityPages.flatMap((page) =>
        page.page.map((builder) => builder.userId),
      ),
    ).toEqual([frank, carol, bob])
    expect(multiCityPages.at(-1)?.isDone).toBe(true)
  })
})

describe('explore dismissal reset bounds', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('continues a large project reset in scheduled batches', async () => {
    const t = convexTest(schema, modules)
    const viewerId = await seedUser(t, { username: 'viewer' })
    const ownerId = await seedUser(t, { username: 'owner' })
    const projectId = await seedProject(t, { ownerId, name: 'project' })

    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('explore_history', {
          userId: viewerId,
          projectId,
          firstSeenAt: index,
          lastSeenAt: index,
          dismissedAt: index + 1,
          likedAt: null,
        })
      }
    })

    await expect(
      as(t, 'viewer').mutation(api.explore.resetDismissedProjects, {}),
    ).resolves.toEqual({ resetCount: 100 })
    expect(
      await t.run((ctx) =>
        ctx.db.system.query('_scheduled_functions').collect(),
      ),
    ).toHaveLength(1)
    await t.mutation(resetDismissedProjectsBatch, {
      userId: viewerId,
      requestedAt: NOW,
    })

    expect(
      await t.run((ctx) =>
        ctx.db
          .query('explore_history')
          .withIndex('by_user_dismissed', (query) =>
            query.eq('userId', viewerId).gt('dismissedAt', 0),
          )
          .take(1),
      ),
    ).toEqual([])
  })

  it('continues a large post reset in scheduled batches', async () => {
    const t = convexTest(schema, modules)
    const viewerId = await seedUser(t, { username: 'viewer' })
    const ownerId = await seedUser(t, { username: 'owner' })
    const projectId = await seedProject(t, { ownerId, name: 'project' })
    const postId = await seedPost(t, projectId, ownerId, NOW)

    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('explore_post_history', {
          userId: viewerId,
          postId,
          firstSeenAt: index,
          lastSeenAt: index,
          dismissedAt: index + 1,
        })
      }
    })

    await expect(
      as(t, 'viewer').mutation(api.explore.resetDismissedPosts, {}),
    ).resolves.toEqual({ resetCount: 100 })
    await t.mutation(resetDismissedPostsBatch, {
      userId: viewerId,
      requestedAt: NOW,
    })

    expect(
      await t.run((ctx) =>
        ctx.db
          .query('explore_post_history')
          .withIndex('by_user_dismissed', (query) =>
            query.eq('userId', viewerId).gt('dismissedAt', 0),
          )
          .take(1),
      ),
    ).toEqual([])
  })
})

const PUBLIC_PROJECT_KEYS = [
  'authorAvatarUrl',
  'authorHandle',
  'authorName',
  'cityLabel',
  'cityVisibilityState',
  'commentsCount',
  'description',
  'fullName',
  'githubStars',
  'languages',
  'lastCommitAt',
  'latestUpdate',
  'locaticLikes',
  'owner',
  'ownerBuildStatus',
  'ownerLocation',
  'ownerUserId',
  'postsCount',
  'primaryLanguage',
  'projectId',
  'reactionCounts',
  'repo',
  'syncStatus',
  'topics',
  'updatedAt',
]

const PUBLIC_BUILDER_KEYS = [
  'avatarUrl',
  'buildStatus',
  'displayName',
  'followersCount',
  'githubUsername',
  'isNewBuilder',
  'location',
  'projectsCount',
  'userId',
]

const PUBLIC_POST_KEYS = [
  '_creationTime',
  '_id',
  'actorId',
  'actorSnapshot',
  'authorRole',
  'body',
  'commentsCount',
  'createdAt',
  'ownerId',
  'projectCityId',
  'projectId',
  'projectSnapshot',
  'projectTopics',
  'reactionCounts',
  'updatedAt',
]

function keysOf(row: object) {
  return Object.keys(row).sort()
}

describe('public explore payloads', () => {
  let t: TestConvex<typeof schema>
  let fixture: PopulatedCityFixture

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    fixture = await seedPopulatedCity(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('return exactly the reviewed public fields for projects, builders and posts', async () => {
    // Snapshot of the key sets: a new field here is a public contract change
    // and must be reviewed (no viewer state, emails, clerk ids or private
    // settings).
    const projects = await t.query(api.explore.listPublic, {
      paginationOpts: PAGE,
      scope: 'global',
    })
    const builders = await t.query(api.explore.listNearbyBuildersPublic, {
      cityIds: [],
      paginationOpts: PAGE,
    })
    const posts = await t.query(api.explore.listPostsPublic, {
      paginationOpts: PAGE,
      scope: 'global',
    })

    expect(projects.page.length).toBeGreaterThan(0)
    expect(builders.page.length).toBeGreaterThan(0)
    expect(posts.page.length).toBeGreaterThan(0)
    for (const row of projects.page) {
      expect(keysOf(row)).toEqual(PUBLIC_PROJECT_KEYS)
      // Sync failures and their reasons are for the owner only.
      expect(row.syncStatus).not.toHaveProperty('error')
    }
    // The card's city link only for exact-city owners.
    const ownerLocation = (projectId: Id<'projects'>) =>
      projects.page.find((row) => row.projectId === projectId)?.ownerLocation
    expect(ownerLocation(fixture.projects.aliceApp)).toMatchObject({
      kind: 'city',
      cityId: fixture.cities.bengaluru,
    })
    expect(ownerLocation(fixture.projects.devTool)).toEqual({
      kind: 'region',
      regionLabel: 'Karnataka, India',
    })
    expect(ownerLocation(fixture.projects.erinService)).toEqual({
      kind: 'none',
    })
    for (const row of builders.page) {
      expect(keysOf(row)).toEqual(PUBLIC_BUILDER_KEYS)
    }
    for (const row of posts.page) {
      expect(keysOf(row)).toEqual(PUBLIC_POST_KEYS)
      expect(keysOf(row.actorSnapshot)).toEqual([
        'avatarUrl',
        'cityId',
        'cityName',
        'displayName',
      ])
    }
  })

  it('reads everywhere for a visitor in default scope and keeps the city member rule', async () => {
    const { bengaluru } = fixture.cities
    const { projects, users } = fixture
    const everywhere = await t.query(api.explore.listPublic, {
      paginationOpts: PAGE,
    })
    const inBengaluru = await t.query(api.explore.listPublic, {
      paginationOpts: PAGE,
      scope: 'custom',
      selectedCityIds: [bengaluru],
    })

    // Everyone in discovery; gwen opted out, so her project is absent.
    expect(everywhere.page.map((row) => row.projectId).sort()).toEqual(
      Object.values(projects)
        .filter((projectId) => projectId !== projects.gwenBot)
        .sort(),
    )
    expect(inBengaluru.page.map((row) => row.projectId).sort()).toEqual(
      [
        projects.aliceApp,
        projects.aliceLib,
        projects.bobCli,
        projects.carolEngine,
      ].sort(),
    )

    const bengaluruBuilders = await t.query(
      api.explore.listNearbyBuildersPublic,
      { cityIds: [bengaluru], paginationOpts: PAGE },
    )
    expect(ids(bengaluruBuilders.page)).toEqual(
      [users.alice, users.bob, users.carol].sort(),
    )
  })

  it('lists only public profiles to visitors', async () => {
    const { bengaluru } = fixture.cities
    const members = await seedUser(t, {
      username: 'mona',
      cityId: bengaluru,
      profileVisibility: 'locatic_only',
    })

    const visitorView = await t.query(api.explore.listNearbyBuildersPublic, {
      cityIds: [bengaluru],
      paginationOpts: PAGE,
    })
    expect(ids(visitorView.page)).not.toContain(members)
    expect(ids(await builders(t, 'frank', [bengaluru]))).toContain(members)
  })

  it('discloses a post author location from the live user, not the stored snapshot', async () => {
    const { posts, users } = fixture
    const actorLocation = async () => {
      const result = await t.query(api.explore.listPostsPublic, {
        paginationOpts: PAGE,
        scope: 'global',
      })
      const post = result.page.find((row) => row._id === posts.bobCli)
      return post
        ? {
            cityId: post.actorSnapshot.cityId,
            cityName: post.actorSnapshot.cityName,
          }
        : null
    }

    expect(await actorLocation()).toEqual({
      cityId: fixture.cities.bengaluru,
      cityName: 'Bengaluru, Karnataka, India',
    })

    await t.run(async (ctx) => {
      const bob = await ctx.db.get(users.bob)
      await ctx.db.patch(users.bob, {
        privacy: { ...bob!.privacy, cityVisibility: 'region_only' },
      })
    })
    expect(await actorLocation()).toEqual({
      cityId: null,
      cityName: 'Karnataka, India',
    })

    const erinPost = (
      await t.query(api.explore.listPostsPublic, {
        paginationOpts: PAGE,
        scope: 'global',
      })
    ).page.find((row) => row._id === posts.erinService)
    expect(erinPost?.actorSnapshot).toMatchObject({
      cityId: null,
      cityName: null,
    })
  })
})

describe('own projects in an explicitly selected city', () => {
  let t: TestConvex<typeof schema>
  let fixture: PopulatedCityFixture

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    fixture = await seedPopulatedCity(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the viewer projects after everyone else, marked as the viewer own', async () => {
    const { bengaluru } = fixture.cities
    const { projects } = fixture
    const result = await as(t, 'alice').query(api.explore.list, {
      paginationOpts: PAGE,
      scope: 'custom',
      selectedCityIds: [bengaluru],
    })

    expect(
      result.page.map((row) => [row.projectId, row.isViewerProject]),
    ).toEqual([
      [projects.carolEngine, false],
      [projects.bobCli, false],
      // Own projects last, newest commit first.
      [projects.aliceApp, true],
      [projects.aliceLib, true],
    ])
  })

  it('keeps own projects out of default and global scopes', async () => {
    const { projects } = fixture
    for (const scope of ['default', 'global'] as const) {
      const result = await as(t, 'alice').query(api.explore.list, {
        paginationOpts: PAGE,
        scope,
      })
      const rows = result.page.map((row) => row.projectId)
      expect(rows).not.toContain(projects.aliceApp)
      expect(rows).not.toContain(projects.aliceLib)
      expect(result.page.every((row) => !row.isViewerProject)).toBe(true)
    }
  })

  it('shows no own projects in a city the viewer is not a member of', async () => {
    const { bengaluru } = fixture.cities
    const result = await as(t, 'dev').query(api.explore.list, {
      paginationOpts: PAGE,
      scope: 'custom',
      selectedCityIds: [bengaluru],
    })

    expect(result.page.map((row) => row.projectId)).not.toContain(
      fixture.projects.devTool,
    )
    expect(result.page.every((row) => !row.isViewerProject)).toBe(true)
  })
})

/**
 * Loads pages the way `useExploreFeedPagination` does, with the real client
 * state machine: the first page, then automatic pages while nothing new is
 * visible, at most `EXPLORE_AUTO_FETCH_LIMIT` in a row; `keepLooking` is the
 * viewer's continuation action. Every page is one query execution, so
 * `pagesRead` is the read count of an interaction.
 */
function exploreFeedClient<T>(
  load: (cursor: string | null) => Promise<PageResult<T>>,
) {
  const pages: Array<PageResult<T>> = []
  let continuation = startExploreContinuation('fixture')
  const items = () => pages.flatMap((page) => page.page)
  const status = () =>
    pages.at(-1)?.isDone ? ('Exhausted' as const) : ('CanLoadMore' as const)

  async function fetchPage() {
    pages.push(await load(pages.at(-1)?.continueCursor ?? null))
    continuation = settleExploreContinuation(continuation, items().length)
  }

  async function settle() {
    while (
      shouldAutoAdvanceExploreFeed({
        continuation,
        status: status(),
        visibleCount: items().length,
      })
    ) {
      continuation = requestExploreContinuation(continuation, items().length, {
        byViewer: false,
      })
      await fetchPage()
    }
    return {
      pagesRead: pages.length,
      phase: getExploreBrowsePhase({
        continuation,
        items: items(),
        status: status(),
      }),
    }
  }

  return {
    async open() {
      await fetchPage()
      return await settle()
    },
    async keepLooking() {
      continuation = requestExploreContinuation(continuation, items().length, {
        byViewer: true,
      })
      await fetchPage()
      return await settle()
    },
  }
}

const UNEVEN_PROJECT_COUNT = 90

/**
 * Deliberately uneven Bengaluru data for the language/topic filters, newest commit first:
 * rows 0-39 are all TypeScript (common), later rows mix in Go every third
 * row, every row has the topic `web`, and only the oldest row (89) has
 * `webgpu` (rare), so it sits past the first page plus three empty
 * automatic pages at the real page size.
 */
async function seedUnevenProjects(t: TestConvex<typeof schema>) {
  const { bengaluru } = await seedCities(t)
  const owners = [
    await seedUser(t, { username: 'ula', cityId: bengaluru }),
    await seedUser(t, { username: 'uma', cityId: bengaluru }),
    await seedUser(t, { username: 'uno', cityId: bengaluru }),
  ]
  await seedUser(t, { username: 'vis', cityId: bengaluru })
  const projectIdsByRow: Array<Id<'projects'>> = []
  for (let row = 0; row < UNEVEN_PROJECT_COUNT; row += 1) {
    projectIdsByRow.push(
      await seedProject(t, {
        ownerId: owners[row % owners.length]!,
        name: `repo-${row}`,
        languages: row >= 40 && row % 3 === 0 ? ['Go'] : ['TypeScript'],
        githubTopics: row === UNEVEN_PROJECT_COUNT - 1 ? ['webgpu'] : ['web'],
        lastCommitAt: NOW - row * 60_000,
      }),
    )
  }
  return { bengaluru, projectIdsByRow }
}

describe('explore language and topic filters', () => {
  let t: TestConvex<typeof schema>

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const filteredFeed = (
    viewer: string | null,
    filters: { language?: string; topic?: string },
    scope:
      | { scope: 'global' }
      | { scope: 'custom'; selectedCityIds: Array<Id<'cities'>> } = {
      scope: 'global',
    },
  ) =>
    exploreFeedClient((cursor) => {
      const args = {
        ...scope,
        ...filters,
        paginationOpts: { numItems: EXPLORE_PAGINATED_PAGE_SIZE, cursor },
      }
      return viewer === null
        ? t.query(api.explore.listPublic, args)
        : as(t, viewer).query(api.explore.list, args)
    })

  it('applies project filters before limiting text-search results', async () => {
    const { bengaluru } = await seedCities(t)
    const owner = await seedUser(t, {
      username: 'search-owner',
      cityId: bengaluru,
    })
    await seedUser(t, { username: 'search-viewer', cityId: bengaluru })
    const rustProject = await seedProject(t, {
      ownerId: owner,
      name: 'match-rust',
      primaryLanguage: 'Rust',
      githubTopics: ['webgpu'],
      addedAt: daysAgo(20),
    })
    for (let index = 0; index < 10; index += 1) {
      await seedProject(t, {
        ownerId: owner,
        name: `match-typescript-${index}`,
        primaryLanguage: 'TypeScript',
        githubTopics: ['webgpu'],
        addedAt: NOW - index * 1_000,
      })
    }

    const result = await as(t, 'search-viewer').query(
      api.explore.searchProjects,
      {
        q: 'match',
        language: 'rust',
        topic: 'WebGPU',
      },
    )

    expect(result.projectResultScope).toBe('recent')
    expect(result.projects.map((project) => project.projectId)).toEqual([
      rustProject,
    ])
  })

  it('fills the first page for a common primary language', async () => {
    const { projectIdsByRow } = await seedUnevenProjects(t)

    const { pagesRead, phase } = await filteredFeed(null, {
      language: 'typescript',
    }).open()

    expect(pagesRead).toBe(1)
    expect(phase).toMatchObject({ status: 'ready', more: 'available' })
    expect('items' in phase && phase.items.map((row) => row.projectId)).toEqual(
      projectIdsByRow.slice(0, EXPLORE_PAGINATED_PAGE_SIZE),
    )
    expect(
      'items' in phase &&
        phase.items.every((row) => row.primaryLanguage === 'TypeScript'),
    ).toBe(true)
  })

  it('stops at the read budget with "keep looking" for a rare topic, then finds it', async () => {
    const { projectIdsByRow } = await seedUnevenProjects(t)
    const feed = filteredFeed('vis', { topic: 'WebGPU' })

    const first = await feed.open()
    // One page plus the automatic budget, then an explicit continuation:
    // never an empty state while the server has more.
    expect(first.pagesRead).toBe(1 + EXPLORE_AUTO_FETCH_LIMIT)
    expect(EXPLORE_AUTO_FETCH_LIMIT * EXPLORE_PAGINATED_PAGE_SIZE).toBe(60)
    expect(first.phase).toEqual({ status: 'needsContinuation', items: [] })

    const next = await feed.keepLooking()
    expect(next.pagesRead).toBe(2 + EXPLORE_AUTO_FETCH_LIMIT)
    expect(next.phase).toMatchObject({ status: 'ready', more: 'none' })
    expect(
      'items' in next.phase && next.phase.items.map((row) => row.projectId),
    ).toEqual([projectIdsByRow.at(-1)])
    expect('items' in next.phase && next.phase.items[0]?.topics).toContain(
      'webgpu',
    )
  })

  it('shows the empty state only once the filtered feed is done', async () => {
    await seedUnevenProjects(t)
    const feed = filteredFeed(null, { topic: 'nothing-here' })

    expect((await feed.open()).phase.status).toBe('needsContinuation')
    const done = await feed.keepLooking()
    expect(done.phase).toEqual({ status: 'exhausted' })
  })

  it('returns only rows matching language, topic and city together', async () => {
    const fixture = await seedPopulatedCity(t)
    const { bengaluru } = fixture.cities
    const { projects } = fixture
    const args = {
      paginationOpts: PAGE,
      scope: 'custom' as const,
      selectedCityIds: [bengaluru],
      language: 'TypeScript',
      topic: 'ai',
    }

    // frankApi (Hyderabad) and devTool (region only) are TypeScript + ai but
    // outside the city; carolEngine is in the city but Rust.
    for (const result of [
      await t.query(api.explore.listPublic, args),
      await as(t, 'frank').query(api.explore.list, args),
    ]) {
      expect(result.isDone).toBe(true)
      expect(result.page.map((row) => row.projectId)).toEqual([
        projects.aliceApp,
        projects.bobCli,
      ])
      // The topics a card shows are the ones the filter tested.
      for (const row of result.page) {
        expect(row.topics).toContain('ai')
        expect(row.primaryLanguage).toBe('TypeScript')
      }
    }
  })

  it('finds a project by its edited Locatic tag, not the GitHub topic it replaced', async () => {
    const fixture = await seedPopulatedCity(t)
    const topicRows = async (topic: string) =>
      (
        await t.query(api.explore.listPublic, {
          paginationOpts: PAGE,
          scope: 'global',
          topic,
        })
      ).page.map((row) => row.projectId)

    expect(await topicRows('developer-tools')).toEqual([
      fixture.projects.bobCli,
    ])
    expect(await topicRows('cli')).toEqual([])
  })

  it('applies the filters to the viewer own projects in a selected city', async () => {
    const fixture = await seedPopulatedCity(t)
    const result = await as(t, 'alice').query(api.explore.list, {
      paginationOpts: PAGE,
      scope: 'custom',
      selectedCityIds: [fixture.cities.bengaluru],
      topic: 'routing',
    })

    expect(
      result.page.map((row) => [row.projectId, row.isViewerProject]),
    ).toEqual([[fixture.projects.aliceLib, true]])
  })

  it('returns the same page for the same filters and cursor, as a reload does', async () => {
    const { bengaluru } = await seedUnevenProjects(t)
    const args = {
      scope: 'custom' as const,
      selectedCityIds: [bengaluru],
      language: 'go',
    }
    const first = await t.query(api.explore.listPublic, {
      ...args,
      paginationOpts: { numItems: EXPLORE_PAGINATED_PAGE_SIZE, cursor: null },
    })
    const secondPage = () =>
      t.query(api.explore.listPublic, {
        ...args,
        paginationOpts: {
          numItems: EXPLORE_PAGINATED_PAGE_SIZE,
          cursor: first.continueCursor,
        },
      })

    // Rows 0-39 are TypeScript, so the first Go page is the third.
    expect(first).toMatchObject({ page: [], isDone: false })
    const again = await secondPage()
    expect(again.page.map((row) => row.projectId)).toEqual(
      (await secondPage()).page.map((row) => row.projectId),
    )
    expect(again.continueCursor).toBe((await secondPage()).continueCursor)
  })
})

describe('nearby builders order and collaboration filter', () => {
  let t: TestConvex<typeof schema>

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const setLastPublicActivity = (userId: Id<'users'>, at: number) =>
    t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      await ctx.db.patch(userId, {
        stats: { ...user!.stats, lastPublicActivityAt: at },
      })
    })

  it('lists recent public work first, then inactive builders newest account first', async () => {
    const { bengaluru, hyderabad } = await seedCities(t)
    await seedUser(t, { username: 'vee', cityId: hyderabad })
    // Inserted oldest account first, as sign-ups are.
    const old = await seedUser(t, {
      username: 'old',
      cityId: bengaluru,
      followersCount: 900,
      createdAt: daysAgo(400),
    })
    const mid = await seedUser(t, {
      username: 'mid',
      cityId: bengaluru,
      createdAt: daysAgo(200),
    })
    const recent = await seedUser(t, {
      username: 'recent',
      cityId: bengaluru,
      createdAt: daysAgo(5),
    })
    const busy = await seedUser(t, { username: 'busy', cityId: bengaluru })
    const shipped = await seedUser(t, {
      username: 'shipped',
      cityId: bengaluru,
    })
    const gone = await seedUser(t, { username: 'gone', cityId: bengaluru })
    await setLastPublicActivity(shipped, daysAgo(10))
    await setLastPublicActivity(busy, daysAgo(1))
    await setLastPublicActivity(gone, NOW)
    // A deleted account that still carries the discovery flag stays out.
    await t.run((ctx) => ctx.db.patch(gone, { deletedAt: NOW }))

    const expected = [busy, shipped, recent, mid, old]
    const city = await as(t, 'vee').query(api.explore.listNearbyBuilders, {
      cityIds: [bengaluru],
      paginationOpts: PAGE,
    })
    expect(city.page.map((builder) => builder.userId)).toEqual(expected)

    // Everywhere, one index read per page, one row at a time.
    const everywhere = await drain((cursor) =>
      t.query(api.explore.listNearbyBuildersPublic, {
        cityIds: [],
        paginationOpts: { numItems: 1, cursor },
      }),
    )
    expect(
      everywhere
        .flatMap((page) => page.page.map((builder) => builder.userId))
        .filter((userId) => expected.includes(userId)),
    ).toEqual(expected)
  })

  it('labels accounts under 30 days as new builders without exposing createdAt', async () => {
    const fixture = await seedPopulatedCity(t)
    const { carol } = fixture.users
    const rows = (
      await t.query(api.explore.listNearbyBuildersPublic, {
        cityIds: [],
        paginationOpts: PAGE,
      })
    ).page

    // carol joined 3 days ago; everyone else 120 days ago.
    expect(
      rows.filter((row) => row.isNewBuilder).map((row) => row.userId),
    ).toEqual([carol])
    for (const row of rows) {
      expect(row).not.toHaveProperty('createdAt')
    }
  })

  it('keeps only builders open to collaboration when the chip is on', async () => {
    const fixture = await seedPopulatedCity(t)
    const { alice, carol, frank } = fixture.users
    const collaborationStatuses = [
      'open_to_collab',
      'looking_for_cofounder',
      'hiring',
    ]

    const everywhere = await as(t, 'bob').query(
      api.explore.listNearbyBuilders,
      {
        cityIds: [],
        paginationOpts: PAGE,
        openToCollab: true,
      },
    )
    expect(ids(everywhere.page)).toEqual([alice, carol, frank].sort())
    for (const builder of everywhere.page) {
      expect(collaborationStatuses).toContain(builder.buildStatus)
    }

    const city = await t.query(api.explore.listNearbyBuildersPublic, {
      cityIds: [fixture.cities.bengaluru],
      paginationOpts: PAGE,
      openToCollab: true,
    })
    expect(ids(city.page)).toEqual([alice, carol].sort())

    // Off (or absent) lists every builder again.
    const all = await as(t, 'bob').query(api.explore.listNearbyBuilders, {
      cityIds: [],
      paginationOpts: PAGE,
      openToCollab: false,
    })
    expect(all.page.length).toBeGreaterThan(everywhere.page.length)

    const soloSearchMatch = await seedUser(t, {
      username: 'candidate-solo',
      cityId: fixture.cities.bengaluru,
      buildStatus: 'building_solo',
    })
    const openSearchMatch = await seedUser(t, {
      username: 'candidate-open',
      cityId: fixture.cities.bengaluru,
      buildStatus: 'open_to_collab',
    })
    const search = await as(t, 'bob').query(api.explore.searchBuilders, {
      q: 'candidate',
      openToCollab: true,
    })

    expect(search.map((builder) => builder.userId)).toContain(openSearchMatch)
    expect(search.map((builder) => builder.userId)).not.toContain(
      soloSearchMatch,
    )
    expect(
      search.every((builder) =>
        collaborationStatuses.includes(builder.buildStatus),
      ),
    ).toBe(true)
  })
})
