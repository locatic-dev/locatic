import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  BENGALURU,
  NOW,
  daysAgo,
  fixtureClerkId,
  seedCity,
  seedPost,
  seedProject,
  seedRelease,
  seedUser,
  purgeFixtureAccount,
} from './__tests__/fixtures.helpers'
import {
  raiseLastPublicActivity,
  selectMetadataRefreshTargets,
} from './lib/activity'
import type { Doc } from './lib/types'

const modules = import.meta.glob('./**/*.ts')

type T = TestConvex<typeof schema>

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

async function backfillActivity(t: T, batchSize?: number) {
  const first = await t.mutation(internal.users.backfillLastPublicActivity, {
    batchSize,
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return first
}

/** The stored signal; null when the field is unset (no public work). */
async function activityOf(t: T, userId: Id<'users'>) {
  return await t.run(
    async (ctx) =>
      (await ctx.db.get(userId))?.stats.lastPublicActivityAt ?? null,
  )
}

/** Every field the builders ranking reads from a user row. */
async function rankingInputs(t: T, userId: Id<'users'>) {
  return await t.run(async (ctx) => {
    const user = await ctx.db.get(userId)
    return {
      appearInExplore: user?.appearInExplore,
      cityId: user?.profile.cityId,
      createdAt: user?.createdAt,
      followersCount: user?.stats.followersCount,
      lastPublicActivityAt: user?.stats.lastPublicActivityAt,
    }
  })
}

/**
 * Builders in activity order as the activity indexes serve them: active builders by
 * `lastPublicActivityAt` descending, then builders without public work by
 * `createdAt` descending (Explore applies the same null-last rule).
 */
async function builderActivityOrder(t: T, cityId?: Id<'cities'>) {
  return await t.run(async (ctx) => {
    const active = cityId
      ? await ctx.db
          .query('users')
          .withIndex('by_city_public_activity', (query) =>
            query
              .eq('appearInExplore', true)
              .eq('profile.cityId', cityId)
              .gte('stats.lastPublicActivityAt', 0),
          )
          .order('desc')
          .take(10)
      : await ctx.db
          .query('users')
          .withIndex('by_public_activity', (query) =>
            query
              .eq('appearInExplore', true)
              .gte('stats.lastPublicActivityAt', 0),
          )
          .order('desc')
          .take(10)
    const inactive = (
      await ctx.db
        .query('users')
        .withIndex('by_created_at')
        .order('desc')
        .take(10)
    ).filter(
      (user) =>
        user.appearInExplore && user.stats.lastPublicActivityAt === undefined,
    )
    return [...active, ...inactive].map((user) => user.github.username)
  })
}

function repositoryFrom(project: Doc<'projects'>, lastCommitAt: number) {
  const { commitFrequency: _commitFrequency, ...github } = project.github
  return {
    ...github,
    lastCommitAt,
    lastMetadataSyncedAt: NOW,
    lastMetadataSyncAttemptedAt: NOW,
  }
}

function release(githubReleaseId: number, publishedAt: number | null) {
  return {
    githubReleaseId,
    tagName: `v${githubReleaseId}`,
    name: null,
    body: null,
    htmlUrl: `https://github.com/example/releases/${githubReleaseId}`,
    isDraft: publishedAt === null,
    isPrerelease: false,
    publishedAt,
    createdAt: publishedAt ?? NOW,
    updatedAt: publishedAt ?? NOW,
  }
}

describe('lastPublicActivityAt ranking signal', () => {
  let t: T
  let bengaluru: Id<'cities'>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    bengaluru = await seedCity(t, BENGALURU)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ranks an active new builder above a follower-heavy inactive one', async () => {
    const veteran = await seedUser(t, {
      username: 'veteran',
      cityId: bengaluru,
      followersCount: 900,
      createdAt: daysAgo(700),
    })
    await seedProject(t, {
      ownerId: veteran,
      name: 'old-lib',
      lastCommitAt: daysAgo(400),
    })
    const nova = await seedUser(t, {
      username: 'nova',
      cityId: bengaluru,
      createdAt: daysAgo(5),
    })
    const novaProject = await seedProject(t, {
      ownerId: nova,
      name: 'fresh',
      lastCommitAt: daysAgo(3),
    })
    await seedUser(t, {
      username: 'lurker',
      cityId: bengaluru,
      followersCount: 50,
      createdAt: daysAgo(10),
    })
    await seedUser(t, {
      username: 'oldlurker',
      cityId: bengaluru,
      followersCount: 400,
      createdAt: daysAgo(300),
    })
    await backfillActivity(t)

    await as(t, 'nova').mutation(api.posts.create, {
      projectId: novaProject,
      body: 'shipped the first build',
    })

    expect(await activityOf(t, nova)).toBe(NOW)
    expect(await activityOf(t, veteran)).toBe(daysAgo(400))
    const expected = ['nova', 'veteran', 'lurker', 'oldlurker']
    expect(await builderActivityOrder(t)).toEqual(expected)
    expect(await builderActivityOrder(t, bengaluru)).toEqual(expected)
  })

  it('a profile visit and contribution sync change no ranking input', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    await seedProject(t, {
      ownerId: ada,
      name: 'maps',
      lastCommitAt: daysAgo(2),
    })
    await backfillActivity(t)
    const before = await rankingInputs(t, ada)
    const orderBefore = await builderActivityOrder(t)

    await t.query(api.users.publicProfileOverview, { username: 'ada' })
    await t.query(api.users.publicProfileShippingLog, { username: 'ada' })
    await t.mutation(internal.users.patchContributions, {
      userId: ada,
      contributions: {
        totalContributions: 42,
        weeks: [{ days: [{ date: '2026-09-01', count: 42 }] }],
        syncedAt: NOW,
      },
    })

    expect(await rankingInputs(t, ada)).toEqual(before)
    expect(await builderActivityOrder(t)).toEqual(orderBefore)
  })

  it('likes are not activity', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    const project = await seedProject(t, {
      ownerId: ada,
      name: 'maps',
      lastCommitAt: daysAgo(20),
    })
    await seedUser(t, { username: 'bob', cityId: bengaluru })
    await backfillActivity(t)

    await t.mutation(internal.github.applyProjectLike, {
      projectId: project,
      clerkId: fixtureClerkId('bob'),
    })

    expect(await activityOf(t, ada)).toBe(daysAgo(20))
  })

  it('release import and metadata refresh raise the owner, only for visible projects', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    const visible = await seedProject(t, {
      ownerId: ada,
      name: 'maps',
      lastCommitAt: daysAgo(30),
    })
    const hidden = await seedProject(t, {
      ownerId: ada,
      name: 'secret',
      lastCommitAt: daysAgo(30),
      isVisible: false,
    })
    await backfillActivity(t)
    expect(await activityOf(t, ada)).toBe(daysAgo(30))

    await t.mutation(internal.github.patchProjectReleases, {
      projectId: hidden,
      releases: [release(1, daysAgo(1))],
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(30))

    await t.mutation(internal.github.patchProjectReleases, {
      projectId: visible,
      releases: [release(2, daysAgo(10)), release(3, null)],
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(10))

    const [hiddenDoc, visibleDoc] = await t.run(async (ctx) => [
      await ctx.db.get(hidden),
      await ctx.db.get(visible),
    ])
    await t.mutation(internal.github.patchProjectMetadata, {
      projectId: hidden,
      repository: repositoryFrom(hiddenDoc!, daysAgo(1)),
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(10))

    await t.mutation(internal.github.patchProjectMetadata, {
      projectId: visible,
      repository: repositoryFrom(visibleDoc!, daysAgo(4)),
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(4))

    // Correcting a commit time downward falls back to the latest release.
    await t.mutation(internal.github.patchProjectMetadata, {
      projectId: visible,
      repository: repositoryFrom(visibleDoc!, daysAgo(50)),
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(10))
  })

  it('a post on a hidden project is not public work', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    const hidden = await seedProject(t, {
      ownerId: ada,
      name: 'secret',
      isVisible: false,
    })

    await as(t, 'ada').mutation(api.posts.create, {
      projectId: hidden,
      body: 'notes to self',
    })

    expect(await activityOf(t, ada)).toBeNull()
  })

  it('materializes project activity when a legacy project receives a post', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    const projectId = await seedProject(t, {
      ownerId: ada,
      name: 'legacy',
      lastCommitAt: daysAgo(10),
    })
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      const { lastPublicActivityAt: _activity, ...locatic } = project!.locatic
      await ctx.db.patch(projectId, { locatic })
    })

    await as(t, 'ada').mutation(api.posts.create, {
      projectId,
      body: 'first update after migration',
    })

    expect(
      await t.run(
        async (ctx) =>
          (await ctx.db.get(projectId))?.locatic.lastPublicActivityAt,
      ),
    ).toBe(NOW)
    expect(await activityOf(t, ada)).toBe(NOW)
  })

  it('deleting the latest post recomputes the signal from what is left', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    const project = await seedProject(t, {
      ownerId: ada,
      name: 'maps',
      lastCommitAt: daysAgo(12),
    })
    const post = await as(t, 'ada').mutation(api.posts.create, {
      projectId: project,
      body: 'v1 is out',
    })
    expect(await activityOf(t, ada)).toBe(NOW)

    await as(t, 'ada').mutation(api.posts.remove, { postId: post!._id })

    expect(await activityOf(t, ada)).toBe(daysAgo(12))
  })

  it('hiding and showing a project takes its work out and brings it back', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    const recent = await seedProject(t, {
      ownerId: ada,
      name: 'recent',
      lastCommitAt: daysAgo(2),
    })
    await seedProject(t, {
      ownerId: ada,
      name: 'older',
      lastCommitAt: daysAgo(40),
    })
    await seedRelease(t, recent, daysAgo(1))
    await backfillActivity(t)
    expect(await activityOf(t, ada)).toBe(daysAgo(1))

    await as(t, 'ada').mutation(api.projects.updateVisibility, {
      projectId: recent,
      isVisible: false,
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(40))

    await as(t, 'ada').mutation(api.projects.updateVisibility, {
      projectId: recent,
      isVisible: true,
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(1))
  })

  it('stays exact beyond fifty projects when posts, releases and visibility are removed', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    // Insert the active project first so fifty newer documents follow it. The
    // old implementation scanned those newer documents and missed this one.
    const active = await seedProject(t, {
      ownerId: ada,
      name: 'active',
      lastCommitAt: daysAgo(3),
    })
    await seedRelease(t, active, daysAgo(2))
    const post = await as(t, 'ada').mutation(api.posts.create, {
      projectId: active,
      body: 'shipping today',
    })
    for (let index = 0; index < 50; index += 1) {
      await seedProject(t, {
        ownerId: ada,
        name: `dormant-${index}`,
        lastCommitAt: daysAgo(40),
      })
    }

    await backfillActivity(t)
    expect(await activityOf(t, ada)).toBe(NOW)

    await as(t, 'ada').mutation(api.posts.remove, { postId: post!._id })
    expect(await activityOf(t, ada)).toBe(daysAgo(2))

    await t.mutation(internal.github.patchProjectReleases, {
      projectId: active,
      releases: [],
      deleteMissing: true,
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(3))

    await as(t, 'ada').mutation(api.projects.updateVisibility, {
      projectId: active,
      isVisible: false,
    })
    expect(await activityOf(t, ada)).toBe(daysAgo(40))
  })

  it('clamps a future timestamp to now', () => {
    const stats = { lastPublicActivityAt: daysAgo(3) } as Doc<'users'>['stats']

    expect(
      raiseLastPublicActivity(stats, NOW + 1_000_000, NOW).lastPublicActivityAt,
    ).toBe(NOW)
    expect(raiseLastPublicActivity(stats, daysAgo(5), NOW)).toBe(stats)
    expect(raiseLastPublicActivity(stats, null, NOW)).toBe(stats)
  })
})

describe('internal.users.backfillLastPublicActivity', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pages through every user, scheduling itself, and clears stale values', async () => {
    vi.useFakeTimers({ now: NOW })
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const ada = await seedUser(t, { username: 'ada' })
    const project = await seedProject(t, {
      ownerId: ada,
      name: 'maps',
      lastCommitAt: daysAgo(9),
    })
    await seedPost(t, project, ada, daysAgo(6))
    await seedPost(t, project, ada, daysAgo(2), { deletedAt: daysAgo(1) })
    await seedRelease(t, project, daysAgo(7))
    const bob = await seedUser(t, { username: 'bob' })
    await seedProject(t, {
      ownerId: bob,
      name: 'hidden',
      lastCommitAt: daysAgo(1),
      isVisible: false,
    })
    const cy = await seedUser(t, { username: 'cy' })
    await t.run(async (ctx) => {
      const user = await ctx.db.get(cy)
      await ctx.db.patch(cy, {
        stats: { ...user!.stats, lastPublicActivityAt: daysAgo(1) },
      })
      const legacyProject = await ctx.db.get(project)
      const { lastPublicActivityAt: _activity, ...legacyLocatic } =
        legacyProject!.locatic
      await ctx.db.patch(project, { locatic: legacyLocatic })
    })

    const first = await backfillActivity(t, 1)
    expect(first).toMatchObject({
      phase: 'projects',
      scanned: 1,
      isDone: false,
    })
    expect(
      await t.run(
        async (ctx) =>
          (await ctx.db.get(project))?.locatic.lastPublicActivityAt,
      ),
    ).toBe(daysAgo(6))

    expect(await activityOf(t, ada)).toBe(daysAgo(6))
    expect(await activityOf(t, bob)).toBeNull()
    expect(await activityOf(t, cy)).toBeNull()
  })
})

describe('hourly metadata refresh targets', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes discovery-visible projects first and keeps a share for the stalest', async () => {
    vi.useFakeTimers({ now: NOW })
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const bengaluru = await seedCity(t, BENGALURU)
    const hidden = await seedUser(t, {
      username: 'hidden',
      cityId: bengaluru,
      appearInExplore: false,
    })
    const shown = await seedUser(t, { username: 'shown', cityId: bengaluru })
    const stalest = await seedProject(t, {
      ownerId: hidden,
      name: 'a',
      addedAt: daysAgo(90),
    })
    await seedProject(t, { ownerId: hidden, name: 'b', addedAt: daysAgo(80) })
    await seedProject(t, { ownerId: hidden, name: 'c', addedAt: daysAgo(70) })
    const eligible = await seedProject(t, {
      ownerId: shown,
      name: 'd',
      addedAt: daysAgo(60),
    })
    const eligibleNewer = await seedProject(t, {
      ownerId: shown,
      name: 'e',
      addedAt: daysAgo(50),
    })

    const ids = await t.query(internal.github.listRefreshableProjectIds, {
      limit: 3,
    })

    expect(ids).toEqual([stalest, eligible, eligibleNewer])
  })

  it('fills remaining slots with the stalest rows when few are eligible', () => {
    const row = (id: string, isEligible: boolean) => ({
      id,
      exploreOwner: { isEligible },
    })
    const candidates = [
      row('a', false),
      row('b', false),
      row('c', true),
      row('d', false),
    ]

    expect(
      selectMetadataRefreshTargets(candidates, 3).map((item) => item.id),
    ).toEqual(['a', 'b', 'c'])
    expect(
      selectMetadataRefreshTargets(candidates, 10).map((item) => item.id),
    ).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('users.publicProfileShippingLog', () => {
  let t: T
  let bengaluru: Id<'cities'>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    bengaluru = await seedCity(t, BENGALURU)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists public releases and posts newest first', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    const maps = await seedProject(t, { ownerId: ada, name: 'maps' })
    const secret = await seedProject(t, {
      ownerId: ada,
      name: 'secret',
      isVisible: false,
    })
    await seedRelease(t, maps, daysAgo(10), {
      tagName: 'v1.0.0',
      name: 'First light',
    })
    await seedRelease(t, maps, daysAgo(3), { tagName: 'v1.1.0', name: null })
    await seedRelease(t, maps, null, { tagName: 'v2.0.0-draft' })
    await seedRelease(t, secret, daysAgo(1), { tagName: 'v9' })
    await seedPost(t, maps, ada, daysAgo(5), {
      body: 'tiles now   render\nfast',
    })
    await seedPost(t, maps, ada, daysAgo(2), { deletedAt: daysAgo(1) })
    await seedPost(t, secret, ada, daysAgo(1), { body: 'hidden work' })

    const log = await t.query(api.users.publicProfileShippingLog, {
      username: 'ada',
    })

    expect(
      log?.map((entry) =>
        entry.kind === 'release'
          ? ['release', entry.title, entry.at]
          : ['post', entry.excerpt, entry.at],
      ),
    ).toEqual([
      ['release', 'v1.1.0', daysAgo(3)],
      ['post', 'tiles now render fast', daysAgo(5)],
      ['release', 'First light', daysAgo(10)],
    ])
    expect(log?.[0]?.project).toEqual({
      owner: 'ada',
      repo: 'maps',
      fullName: 'ada/maps',
    })
  })

  it('caps the log at ten entries', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    const maps = await seedProject(t, { ownerId: ada, name: 'maps' })
    for (let day = 1; day <= 12; day += 1) {
      await seedPost(t, maps, ada, daysAgo(day))
    }

    const log = await t.query(api.users.publicProfileShippingLog, {
      username: 'ada',
    })

    expect(log).toHaveLength(10)
    expect(log?.[0]?.at).toBe(daysAgo(1))
  })

  it('returns an empty log for a builder without releases or posts', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: bengaluru })
    await seedProject(t, { ownerId: ada, name: 'maps' })

    expect(
      await t.query(api.users.publicProfileShippingLog, { username: 'ada' }),
    ).toEqual([])
  })

  it('follows profile access: null for a members-only profile and a visitor', async () => {
    const ada = await seedUser(t, {
      username: 'ada',
      cityId: bengaluru,
      profileVisibility: 'locatic_only',
    })
    const maps = await seedProject(t, { ownerId: ada, name: 'maps' })
    await seedRelease(t, maps, daysAgo(3))
    await seedUser(t, { username: 'bob', cityId: bengaluru })

    expect(
      await t.query(api.users.publicProfileShippingLog, { username: 'ada' }),
    ).toBeNull()
    expect(
      await as(t, 'bob').query(api.users.publicProfileShippingLog, {
        username: 'ada',
      }),
    ).toHaveLength(1)
  })
})

describe('internal.users.scrubDeletedAccount', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("deletes the purged user's saves, keeps others' and clears the signal", async () => {
    vi.useFakeTimers({ now: NOW })
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const ada = await seedUser(t, { username: 'ada' })
    const bob = await seedUser(t, { username: 'bob' })
    const adaProject = await seedProject(t, {
      ownerId: ada,
      name: 'maps',
      lastCommitAt: daysAgo(2),
    })
    const bobProject = await seedProject(t, { ownerId: bob, name: 'tiles' })
    await backfillActivity(t)
    await t.run(async (ctx) => {
      await ctx.db.insert('saved_projects', {
        userId: ada,
        projectId: bobProject,
        createdAt: daysAgo(3),
      })
      await ctx.db.insert('saved_projects', {
        userId: ada,
        projectId: adaProject,
        createdAt: daysAgo(1),
      })
      await ctx.db.insert('saved_projects', {
        userId: bob,
        projectId: bobProject,
        createdAt: daysAgo(1),
      })
    })

    await purgeFixtureAccount(t, ada)

    const saves = await t.run(async (ctx) =>
      (await ctx.db.query('saved_projects').collect()).map((row) => ({
        userId: row.userId,
        projectId: row.projectId,
      })),
    )
    expect(saves).toEqual([{ userId: bob, projectId: bobProject }])
    expect(await activityOf(t, ada)).toBeNull()
    expect(await activityOf(t, bob)).not.toBeNull()
  })
})
