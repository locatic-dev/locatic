import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'
import {
  BENGALURU,
  HYDERABAD,
  NOW,
  fixtureClerkId,
  seedActivityEvent,
  seedCity,
  seedHomeFeedItem,
  seedPost,
  seedProject,
  seedUser,
  finishLifecycleOwnerSync,
} from './__tests__/fixtures.helpers'
import { assertDigestSelectionsPublic } from './lib/email_campaigns'

const modules = import.meta.glob('./**/*.ts')
const PAGE = { numItems: 100, cursor: null }
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())

async function setup() {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  const city = await seedCity(t, BENGALURU)
  const otherCity = await seedCity(t, HYDERABAD)
  const owner = await seedUser(t, { username: 'owner', cityId: city })
  const other = await seedUser(t, { username: 'other', cityId: city })
  const projects: Id<'projects'>[] = []
  for (let index = 0; index < 56; index++)
    projects.push(
      await seedProject(t, { ownerId: owner, name: `repo-${index}` }),
    )
  await t.run((ctx) =>
    ctx.db.patch(city, {
      stats: { builderCount: 2, projectCount: 56, lastActivityAt: NOW },
    }),
  )
  return {
    t,
    city,
    otherCity,
    owner,
    other,
    projects,
    client: t.withIdentity({ subject: fixtureClerkId('owner') }),
    state: async () => (await t.run((ctx) => ctx.db.get(owner)))!,
    rows: () =>
      t.run((ctx) => Promise.all(projects.map((id) => ctx.db.get(id)))),
  }
}

it('applies restrictive privacy immediately, then synchronizes projects and both post roles in bounded pages', async () => {
  const { t, client, owner, other, city, projects, state, rows } = await setup()
  const foreignProject = await seedProject(t, {
    ownerId: other,
    name: 'foreign',
  })
  const ownedPosts: Id<'posts'>[] = [],
    authoredPosts: Id<'posts'>[] = []
  for (let index = 0; index < 31; index++) {
    ownedPosts.push(await seedPost(t, projects[0], other, NOW + index))
    authoredPosts.push(await seedPost(t, foreignProject, owner, NOW + index))
  }
  await client.mutation(api.users.updatePrivacy, { cityVisibility: 'hidden' })
  expect(
    (await rows()).every((row) => row!.ownerSnapshot.cityId === city),
  ).toBe(true)
  expect((await state()).lifecycleOwnerSync).toMatchObject({
    generation: 1,
    stage: 0,
    cursor: null,
  })
  const global = (
    await t.query(api.explore.listPublic, {
      scope: 'global',
      paginationOpts: PAGE,
    })
  ).page.filter((row) => projects.includes(row.projectId))
  expect(global.length).toBeGreaterThan(0)
  expect(global.every((row) => row.ownerLocation?.kind === 'none')).toBe(true)
  expect(
    (
      await t.query(api.explore.listPublic, {
        scope: 'custom',
        selectedCityIds: [city],
        paginationOpts: PAGE,
      })
    ).page.some((row) => projects.includes(row.projectId)),
  ).toBe(false)
  const postPage = await t.query(api.posts.listByProject, {
    projectId: foreignProject,
    paginationOpts: PAGE,
  })
  expect(postPage.page).toHaveLength(31)
  expect(
    postPage.page.every(
      (post) =>
        post.actorSnapshot.cityId === null &&
        post.actorSnapshot.cityName === null,
    ),
  ).toBe(true)
  const firstJob = { userId: owner, ...(await state()).lifecycleOwnerSync! }
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, firstJob)
  expect(
    (await rows()).filter((row) => row!.ownerSnapshot.cityId === null),
  ).toHaveLength(25)
  const firstCounter = (await t.run((ctx) => ctx.db.get(city)))!.stats
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, firstJob)
  expect((await t.run((ctx) => ctx.db.get(city)))!.stats).toEqual(firstCounter)
  const advance = async () =>
    t.mutation(internal.users.syncLifecycleOwnerStatePage, {
      userId: owner,
      ...(await state()).lifecycleOwnerSync!,
    })
  for (
    let page = 0;
    page < 4 && (await state()).lifecycleOwnerSync!.stage === 0;
    page++
  )
    await advance()
  expect((await state()).lifecycleOwnerSync!.stage).toBe(1)
  await advance()
  expect(
    await t.run(
      async (ctx) =>
        (await Promise.all(ownedPosts.map((id) => ctx.db.get(id)))).filter(
          (post) => post!.projectCityId === null,
        ).length,
    ),
  ).toBe(25)
  for (
    let page = 0;
    page < 4 && (await state()).lifecycleOwnerSync!.stage === 1;
    page++
  )
    await advance()
  expect((await state()).lifecycleOwnerSync!.stage).toBe(2)
  await advance()
  expect(
    await t.run(
      async (ctx) =>
        (await Promise.all(authoredPosts.map((id) => ctx.db.get(id)))).filter(
          (post) => post!.actorSnapshot.cityId === null,
        ).length,
    ),
  ).toBe(25)
  await finishLifecycleOwnerSync(t, owner)
  expect(
    (await rows()).every(
      (row) =>
        row!.ownerSnapshot.cityId === null && row!.exploreOwner.cityId === null,
    ),
  ).toBe(true)
  const posts = await t.run(async (ctx) => ({
    owned: await Promise.all(ownedPosts.map((id) => ctx.db.get(id))),
    authored: await Promise.all(authoredPosts.map((id) => ctx.db.get(id))),
  }))
  expect(posts.owned.every((post) => post!.projectCityId === null)).toBe(true)
  expect(
    posts.authored.every(
      (post) =>
        post!.projectCityId === city && post!.actorSnapshot.cityName === null,
    ),
  ).toBe(true)
  expect((await t.run((ctx) => ctx.db.get(city)))!.stats).toMatchObject({
    builderCount: 1,
    projectCount: 0,
  })
})

it('supersedes interrupted city/profile work and accounts for a project edited between pages exactly once', async () => {
  const { t, client, owner, city, otherCity, projects, state, rows } =
    await setup()
  const profile = (await state()).profile
  const update = (cityId: typeof city, displayName: string) =>
    client.mutation(api.users.updateProfile, {
      displayName,
      cityId,
      bio: '',
      buildStatus: 'open_to_collab',
      socialLinks: profile.socialLinks,
    })
  await update(otherCity, 'First edit')
  expect(
    (await rows()).every((row) => row!.ownerSnapshot.displayName === 'owner'),
  ).toBe(true)
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, {
    userId: owner,
    ...(await state()).lifecycleOwnerSync!,
  })
  const oldJob = { userId: owner, ...(await state()).lifecycleOwnerSync! }
  await update(city, 'Latest edit')
  const beforeStale = await state()
  await t.mutation(internal.users.syncLifecycleOwnerStatePage, oldJob)
  expect(await state()).toEqual(beforeStale)
  await client.mutation(api.projects.updateVisibility, {
    projectId: projects[0],
    isVisible: false,
  })
  await finishLifecycleOwnerSync(t, owner)
  expect(
    (await rows()).every(
      (row) =>
        row!.ownerSnapshot.displayName === 'Latest edit' &&
        row!.ownerSnapshot.cityId === city,
    ),
  ).toBe(true)
  expect((await t.run((ctx) => ctx.db.get(city)))!.stats).toMatchObject({
    builderCount: 2,
    projectCount: 55,
  })
  expect((await t.run((ctx) => ctx.db.get(otherCity)))!.stats).toMatchObject({
    builderCount: 0,
    projectCount: 0,
  })
})

it.each([
  'discovery',
  'deactivation',
  'webhook',
  'backfill',
  'onboarding',
] as const)(
  'queues bounded owner work through %s instead of synchronously rewriting the account',
  async (entry) => {
    const { t, client, owner, city, state, rows } = await setup()
    const before = await rows()
    if (entry === 'discovery')
      await client.mutation(api.users.updateExploreConfig, {
        cityIds: [city],
        stackPrefs: [],
        appearInExplore: false,
      })
    if (entry === 'deactivation')
      await client.mutation(api.users.deactivateAccount, {})
    if (entry === 'webhook') {
      const user = await state()
      await t.mutation(internal.users.upsertFromClerkWebhook, {
        clerkId: user.clerkId,
        email: user.email,
        emailVerified: true,
        githubId: user.github.id,
        githubUsername: 'owner',
        githubUrl: 'https://github.com/owner',
        avatarUrl: 'https://example.com/new.png',
        displayName: 'Changed',
      })
    }
    if (entry === 'backfill')
      await t.mutation(internal.users.backfillOwnerState, { batchSize: 1 })
    if (entry === 'onboarding')
      await client.mutation(api.users.completeOnboarding, {
        displayName: 'Changed',
        bio: '',
        cityId: city,
        exploreCityIds: [city],
        onboardingSelectedOwnedProjectIds: [],
        stackPrefs: [],
      })
    expect(await rows()).toEqual(before)
    expect((await state()).lifecycleOwnerSync).toMatchObject({
      generation: 1,
      stage: 0,
    })
    if (entry === 'discovery' || entry === 'deactivation') {
      const discovery = await t.query(api.explore.listPublic, {
        scope: 'global',
        paginationOpts: PAGE,
      })
      expect(discovery.page.some((row) => row.ownerUserId === owner)).toBe(
        false,
      )
    }
    await finishLifecycleOwnerSync(t, owner)
    expect((await state()).lifecycleOwnerSync?.stage).toBe(3)
    if (entry === 'discovery' || entry === 'deactivation')
      expect((await rows()).every((row) => !row!.exploreOwner.isEligible)).toBe(
        true,
      )
    if (entry === 'webhook' || entry === 'onboarding')
      expect(
        (await rows()).every(
          (row) => row!.ownerSnapshot.displayName === 'Changed',
        ),
      ).toBe(true)
  },
)

it('serves current post identity and hides an inactive foreign actor’s location before copied posts synchronize', async () => {
  const { t, client, owner, other, city, state } = await setup()
  const project = await seedProject(t, { ownerId: other, name: 'foreign' })
  const postId = await seedPost(t, project, owner, NOW)
  const { profile } = await state()
  await client.mutation(api.users.updateProfile, {
    displayName: 'Current name',
    bio: '',
    cityId: city,
    buildStatus: profile.buildStatus,
    socialLinks: profile.socialLinks,
  })
  const readPost = async () =>
    (
      await t.query(api.posts.listByProject, {
        projectId: project,
        paginationOpts: PAGE,
      })
    ).page[0]
  expect(
    (await t.run((ctx) => ctx.db.get(postId)))!.actorSnapshot.displayName,
  ).toBe('owner')
  expect((await readPost()).actorSnapshot.displayName).toBe('Current name')
  await client.mutation(api.users.deactivateAccount, {})
  expect((await readPost()).actorSnapshot).toMatchObject({
    cityId: null,
    cityName: null,
  })
})

it('does not restart owner repair for a purged user or one whose purge has begun', async () => {
  const { t, owner, state } = await setup()
  await t.run((ctx) =>
    ctx.db.patch(owner, { purgeProgress: { stage: 0, cursor: null } }),
  )
  await t.mutation(internal.users.backfillOwnerState, { batchSize: 1 })
  expect((await state()).lifecycleOwnerSync).toBeUndefined()
  await t.run((ctx) =>
    ctx.db.patch(owner, { purgeProgress: undefined, purgedAt: NOW }),
  )
  await t.mutation(internal.users.backfillOwnerState, { batchSize: 1 })
  expect((await state()).lifecycleOwnerSync).toBeUndefined()
})

it('projects current owner privacy into every nested Home project before snapshots catch up', async () => {
  const { t, owner, other, projects } = await setup()
  const event = await seedActivityEvent(
    t,
    owner,
    projects[0],
    NOW,
    'project_posted',
  )
  await seedHomeFeedItem(t, other, event)
  // Explicit stale copy: reads must not depend on how far the worker has progressed.
  await t.run(async (ctx) => {
    const user = (await ctx.db.get(owner))!
    await ctx.db.patch(owner, {
      privacy: { ...user.privacy, cityVisibility: 'hidden' },
    })
  })
  const result = await t
    .withIdentity({ subject: fixtureClerkId('other') })
    .query(api.home.list, { paginationOpts: PAGE })
  const [row] = result.page
  expect(row.project!.ownerSnapshot).toMatchObject({
    cityId: null,
    cityName: null,
  })
  expect(row.project!.exploreOwner.cityId).toBeNull()
  expect(row.projectSnapshot).toMatchObject({ cityId: null, cityName: null })
  for (const target of [row.target, ...row.previewTargets!]) {
    if (target && 'project' in target)
      expect(target.project!.ownerSnapshot).toMatchObject({
        cityId: null,
        cityName: null,
      })
  }
})

it('rejects digest selections immediately after discovery opt-out with stale eligible copies', async () => {
  const { t, client, owner, projects } = await setup()
  const project = (await t.run((ctx) => ctx.db.get(projects[0])))!
  await client.mutation(api.users.updateExploreConfig, {
    cityIds: [],
    stackPrefs: [],
    appearInExplore: false,
  })
  // Leave the persisted discovery flag eligible to model the catch-up window.
  await t.run((ctx) =>
    ctx.db.patch(project._id, { exploreOwner: project.exploreOwner }),
  )
  await expect(
    t.run((ctx) =>
      assertDigestSelectionsPublic(ctx, {
        kind: 'digest',
        body: '',
        cta: null,
        periodKey: 'test',
        periodStart: NOW - 1000,
        periodEnd: NOW,
        projects: [
          {
            projectId: project._id,
            name: project.github.name,
            fullName: project.github.fullName,
            url: 'https://locatic.dev/project/owner/repo-0',
            description: null,
            activityLabel: 'shared',
            activityAt: NOW,
          },
        ],
        discussions: [],
      }),
    ),
  ).rejects.toThrow('no longer public')
  expect((await t.run((ctx) => ctx.db.get(owner)))!.appearInExplore).toBe(false)
})
