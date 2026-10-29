import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import type { DatabaseReader } from './_generated/server'
import { readActiveMapCities, readCityPage } from './cities'
import { PREFIX_READ_BUDGET, readCityPrefixCandidates } from './lib/citySearch'
import {
  LAST_ACTIVITY_WRITE_STEP_MS,
  NEARBY_CELL_READ_LIMIT,
} from './lib/cityStats'
import { getActivityCellKey, getNeighbouringCellKeys } from './lib/geo'
import {
  BENGALURU,
  BERLIN,
  HYDERABAD,
  MYSURU,
  NOW,
  daysAgo,
  fixtureClerkId,
  seedCity,
  seedFollow,
  seedPopulatedCity,
  seedProject,
  seedUser,
  finishLifecycleOwnerSync,
  type FixtureCity,
  type PopulatedCityFixture,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')

type Stats = {
  builderCount: number
  projectCount: number
  lastActivityAt: number | null
}

const ZERO: Stats = { builderCount: 0, projectCount: 0, lastActivityAt: null }

function as(t: TestConvex<typeof schema>, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

/**
 * Stats recomputed in the test from the raw rows, straight from the location-disclosure rules
 * rather than from convex/lib/cityStats.ts or the stored `exploreOwner`: a
 * builder is an exact-city member who is discoverable (appearInExplore, not
 * deactivated or deleted); a project counts when it is visible and its owner
 * is a builder of that city; activity is the latest commit, live post or
 * published release on counted projects.
 */
async function independentRecount(
  t: TestConvex<typeof schema>,
): Promise<Map<string, Stats>> {
  const rows = await t.run(async (ctx) => {
    const [users, projects, posts, releases] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('projects').collect(),
      ctx.db.query('posts').collect(),
      ctx.db.query('project_releases').collect(),
    ])
    const stats = new Map<string, Stats>()
    const entry = (cityId: string) => {
      const current = stats.get(cityId) ?? { ...ZERO }
      stats.set(cityId, current)
      return current
    }

    const builderCity = new Map<string, string>()
    for (const user of users) {
      if (
        user.privacy.cityVisibility === 'exact_city' &&
        user.profile.cityId &&
        user.appearInExplore &&
        !user.deletedAt &&
        !user.deactivatedAt
      ) {
        builderCity.set(user._id, user.profile.cityId)
        entry(user.profile.cityId).builderCount += 1
      }
    }

    for (const project of projects) {
      const cityId = project.locatic.isVisible
        ? builderCity.get(project.ownerId)
        : undefined
      if (!cityId) continue
      const activity = [
        project.github.lastCommitAt,
        ...posts
          .filter((post) => post.projectId === project._id && !post.deletedAt)
          .map((post) => post.createdAt),
        ...releases
          .filter((release) => release.projectId === project._id)
          .map((release) => release.publishedAt ?? 0),
      ]
      const city = entry(cityId)
      city.projectCount += 1
      city.lastActivityAt = Math.max(city.lastActivityAt ?? 0, ...activity)
    }

    return [...stats]
  })
  return new Map(rows)
}

async function maintainedStats(
  t: TestConvex<typeof schema>,
): Promise<Map<string, Stats>> {
  const rows = await t.run(async (ctx) => {
    const cities = await ctx.db.query('cities').collect()
    return cities.map((city): [string, Stats] => [
      city._id as string,
      city.stats
        ? {
            builderCount: city.stats.builderCount,
            projectCount: city.stats.projectCount,
            lastActivityAt: city.stats.lastActivityAt,
          }
        : { ...ZERO },
    ])
  })
  return new Map(rows)
}

/**
 * Counts must match exactly. `lastActivityAt` is a high-water mark between
 * recounts: never below the true value, and null exactly when no project
 * counts.
 */
async function expectCountersMatchRecount(t: TestConvex<typeof schema>) {
  const [expected, maintained] = await Promise.all([
    independentRecount(t),
    maintainedStats(t),
  ])
  for (const [cityId, stats] of maintained) {
    const truth = expected.get(cityId) ?? ZERO
    expect({ cityId, ...pickCounts(stats) }).toEqual({
      cityId,
      ...pickCounts(truth),
    })
    if (truth.lastActivityAt === null) {
      expect(stats.lastActivityAt).toBeNull()
    } else {
      expect(stats.lastActivityAt).toBeGreaterThanOrEqual(truth.lastActivityAt)
    }
  }
}

async function expectStatsEqualRecount(t: TestConvex<typeof schema>) {
  const [expected, maintained] = await Promise.all([
    independentRecount(t),
    maintainedStats(t),
  ])
  for (const [cityId, stats] of maintained) {
    expect({ cityId, ...stats }).toEqual({
      cityId,
      ...(expected.get(cityId) ?? ZERO),
    })
  }
}

function pickCounts(stats: Stats) {
  return { builderCount: stats.builderCount, projectCount: stats.projectCount }
}

/**
 * Runs the recount migration to completion the way the scheduler would: each
 * page schedules the next, and the test executes those continuations itself
 * (cancelling the queued copies) so unrelated scheduled work never runs.
 * Advances the clock first so every run has its own start time.
 */
async function runRecount(t: TestConvex<typeof schema>, batchSize = 2) {
  vi.setSystemTime(Date.now() + 1_000)
  const phases: string[] = []
  let result = await t.mutation(internal.cities.recountStats, { batchSize })
  phases.push(result.phase)
  while (result.scheduledContinuation) {
    const job = await t.run(async (ctx) => {
      const pending = (
        await ctx.db.system.query('_scheduled_functions').collect()
      ).find(
        (scheduled) =>
          scheduled.state.kind === 'pending' &&
          scheduled.name.includes('recountStats'),
      )
      if (pending) await ctx.scheduler.cancel(pending._id)
      return pending
    })
    if (!job) throw new Error('recount continuation was not scheduled')
    result = await t.mutation(internal.cities.recountStats, job.args[0])
    phases.push(result.phase)
  }
  return phases
}

const privacyArgs = {
  profileVisibility: 'public' as const,
  followGraphVisibility: 'public' as const,
  commentHistoryVisibility: 'public' as const,
  likedProjectsVisibility: 'public' as const,
  contributionsVisibility: 'public' as const,
  appearInPulse: true,
}

describe('city counters', () => {
  let t: TestConvex<typeof schema>
  let fixture: PopulatedCityFixture

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    fixture = await seedPopulatedCity(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recounts a populated city from members only, across paginated phases', async () => {
    const { bengaluru, hyderabad, berlin } = fixture.cities

    const phases = await runRecount(t)

    // Seven users and eight projects at two per page, then the cities sweep.
    expect(phases.filter((phase) => phase === 'users').length).toBe(4)
    expect(phases.filter((phase) => phase === 'projects').length).toBe(4)
    expect(phases.at(-1)).toBe('cities')
    await expectStatsEqualRecount(t)

    // alice, bob, carol count; region-only dev and hidden erin do not.
    expect(await t.query(api.cities.getStats, { cityId: bengaluru })).toEqual({
      builderCount: 3,
      projectCount: 4,
      lastActivityAt: daysAgo(1),
    })
    expect(await t.query(api.cities.getStats, { cityId: hyderabad })).toEqual({
      builderCount: 1,
      projectCount: 1,
      lastActivityAt: daysAgo(5),
    })
    expect(await t.query(api.cities.getStats, { cityId: berlin })).toEqual(ZERO)
  })

  it('keeps maintained counters equal to a recount through city, visibility, privacy and account changes', async () => {
    const { bengaluru, hyderabad, berlin } = fixture.cities
    const { bobCli } = fixture.projects
    await runRecount(t)

    // Move a user's city: alice leaves Bengaluru for Hyderabad with her
    // two projects.
    await as(t, 'alice').mutation(api.users.updateProfile, {
      displayName: 'alice',
      bio: '',
      cityId: hyderabad,
      buildStatus: 'open_to_collab',
      socialLinks: {
        github: 'https://github.com/alice',
        x: null,
        linkedin: null,
        bluesky: null,
        website: null,
      },
    })
    await finishLifecycleOwnerSync(t, fixture.users.alice)
    await expectCountersMatchRecount(t)
    expect(
      await t.query(api.cities.getStats, { cityId: hyderabad }),
    ).toMatchObject({ builderCount: 2, projectCount: 3 })

    // Hide a project, then show it again.
    await as(t, 'bob').mutation(api.projects.updateVisibility, {
      projectId: bobCli,
      isVisible: false,
    })
    await expectCountersMatchRecount(t)
    expect(
      await t.query(api.cities.getStats, { cityId: bengaluru }),
    ).toMatchObject({ builderCount: 2, projectCount: 1 })
    await as(t, 'bob').mutation(api.projects.updateVisibility, {
      projectId: bobCli,
      isVisible: true,
    })
    await expectCountersMatchRecount(t)

    // Set a user hidden: carol and her project leave Bengaluru.
    await as(t, 'carol').mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'hidden',
    })
    await finishLifecycleOwnerSync(t, fixture.users.carol)
    await expectCountersMatchRecount(t)

    // Set another user region-only: frank leaves Hyderabad's counts.
    await as(t, 'frank').mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'region_only',
    })
    await finishLifecycleOwnerSync(t, fixture.users.frank)
    await expectCountersMatchRecount(t)

    // A hidden user who switches to exact city joins with their project.
    await as(t, 'erin').mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'exact_city',
    })
    await finishLifecycleOwnerSync(t, fixture.users.erin)
    await expectCountersMatchRecount(t)

    // Leaving discovery removes a builder without changing their city.
    await as(t, 'erin').mutation(api.users.updateExploreConfig, {
      cityIds: [bengaluru],
      stackPrefs: [],
      appearInExplore: false,
    })
    await finishLifecycleOwnerSync(t, fixture.users.erin)
    await expectCountersMatchRecount(t)

    // Delete a user: alice's builder and projects leave Hyderabad.
    await as(t, 'alice').mutation(api.users.deleteAccount, {})
    await finishLifecycleOwnerSync(t, fixture.users.alice)
    await expectCountersMatchRecount(t)
    expect(await t.query(api.cities.getStats, { cityId: hyderabad })).toEqual(
      ZERO,
    )

    // Onboarding into an empty city, then importing a repository.
    await seedUser(t, { username: 'nina', onboarded: false })
    await as(t, 'nina').mutation(api.users.completeOnboarding, {
      displayName: 'nina',
      bio: '',
      cityId: berlin,
      buildStatus: 'building_solo',
      socialLinks: {
        github: 'https://github.com/nina',
        x: null,
        linkedin: null,
        bluesky: null,
        website: null,
      },
      onboardingSelectedOwnedProjectIds: [],
      exploreCityIds: [berlin],
      stackPrefs: [],
    })
    await expectCountersMatchRecount(t)
    const nina = await t.run(async (ctx) =>
      ctx.db
        .query('users')
        .withIndex('by_github_username', (query) =>
          query.eq('github.username', 'nina'),
        )
        .unique(),
    )
    await t.mutation(internal.projects.upsertImportedRepositories, {
      ownerId: nina!._id,
      repositories: [importedRepository('nina', 'tram-map', daysAgo(4))],
    })
    await expectCountersMatchRecount(t)
    expect(await t.query(api.cities.getStats, { cityId: berlin })).toEqual({
      builderCount: 1,
      projectCount: 1,
      lastActivityAt: daysAgo(4),
    })

    // A later recount makes lastActivityAt exact again and changes no count.
    const beforeRecount = await maintainedStats(t)
    await runRecount(t)
    await expectStatsEqualRecount(t)
    const afterRecount = await maintainedStats(t)
    for (const [cityId, stats] of afterRecount) {
      expect(pickCounts(stats)).toEqual(pickCounts(beforeRecount.get(cityId)!))
    }
  })

  it('is idempotent and repairs drifted counters, including cities nobody references', async () => {
    const { bengaluru, berlin } = fixture.cities
    await runRecount(t)
    const first = await maintainedStats(t)

    await runRecount(t)
    expect(await maintainedStats(t)).toEqual(first)

    await t.run(async (ctx) => {
      await ctx.db.patch(bengaluru, {
        stats: { builderCount: 40, projectCount: 0, lastActivityAt: null },
      })
      await ctx.db.patch(berlin, {
        stats: { builderCount: 5, projectCount: 2, lastActivityAt: NOW },
      })
    })

    await runRecount(t)
    expect(await maintainedStats(t)).toEqual(first)
  })

  it('raises lastActivityAt for newer commits, posts and releases on counted projects', async () => {
    const { bengaluru } = fixture.cities
    const { aliceLib, bobCli, carolEngine } = fixture.projects
    await runRecount(t)
    const bengaluruActivity = async () =>
      (await t.query(api.cities.getStats, { cityId: bengaluru }))
        ?.lastActivityAt
    expect(await bengaluruActivity()).toBe(daysAgo(1))

    // A refresh that sees an older commit leaves the high-water mark alone.
    await t.mutation(internal.github.patchProjectMetadata, {
      projectId: aliceLib,
      repository: await metadataRefresh(t, aliceLib, daysAgo(10)),
    })
    expect(await bengaluruActivity()).toBe(daysAgo(1))

    const newerCommitAt = Date.now() - 60_000
    await t.mutation(internal.github.patchProjectMetadata, {
      projectId: aliceLib,
      repository: await metadataRefresh(t, aliceLib, newerCommitAt),
    })
    expect(await bengaluruActivity()).toBe(newerCommitAt)

    // New activity alone moves the mark in steps of at least an hour.
    vi.setSystemTime(Date.now() + LAST_ACTIVITY_WRITE_STEP_MS)
    const postedAt = Date.now()
    await as(t, 'bob').mutation(api.posts.create, {
      projectId: bobCli,
      body: 'New flags for shipit',
    })
    expect(await bengaluruActivity()).toBe(postedAt)

    // A post five minutes later does not rewrite the city document.
    vi.setSystemTime(Date.now() + 5 * 60_000)
    await as(t, 'bob').mutation(api.posts.create, {
      projectId: bobCli,
      body: 'And a changelog',
    })
    expect(await bengaluruActivity()).toBe(postedAt)

    vi.setSystemTime(Date.now() + LAST_ACTIVITY_WRITE_STEP_MS)
    const releasedAt = Date.now()
    await t.mutation(internal.github.patchProjectReleases, {
      projectId: carolEngine,
      releases: [
        githubRelease(1, daysAgo(30)),
        githubRelease(2, releasedAt),
        githubRelease(3, null),
      ],
    })
    expect(await bengaluruActivity()).toBe(releasedAt)

    // The high-water mark is the exact value a recount derives.
    await expectStatsEqualRecount(t)
  })

  it('records no city activity for projects of owners who are not city members', async () => {
    const { devTool } = fixture.projects
    await runRecount(t)
    const before = await maintainedStats(t)

    vi.setSystemTime(Date.now() + 60_000)
    await t.mutation(internal.github.patchProjectMetadata, {
      projectId: devTool,
      repository: await metadataRefresh(t, devTool, Date.now()),
    })
    await as(t, 'dev').mutation(api.posts.create, {
      projectId: devTool,
      body: 'Region-only update',
    })
    await t.mutation(internal.github.patchProjectReleases, {
      projectId: devTool,
      releases: [githubRelease(1, Date.now())],
    })

    expect(await maintainedStats(t)).toEqual(before)
  })

  it('returns null for an unknown city', async () => {
    const goneId = await seedCity(t, { ...BERLIN, slug: 'gone' })
    await t.run((ctx) => ctx.db.delete(goneId))

    expect(await t.query(api.cities.getStats, { cityId: goneId })).toBeNull()
  })
})

function searchFixtureCity(
  name: string,
  region: string | null,
  country: string,
  countryCode: string,
  aliases: string[] = [],
): FixtureCity {
  return {
    slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${countryCode.toLowerCase()}`,
    name,
    region,
    country,
    countryCode,
    lat: 0,
    lng: 0,
    aliases,
    timezone: null,
  }
}

const BERN = searchFixtureCity('Bern', 'Bern', 'Switzerland', 'CH')
const BERDYCHIV = searchFixtureCity(
  'Berdychiv',
  'Zhytomyr Oblast',
  'Ukraine',
  'UA',
)
const BNEI_BRAK = searchFixtureCity('Bnei Brak', 'Tel Aviv', 'Israel', 'IL', [
  'bene berak',
])
const HYDERABAD_PK = searchFixtureCity('Hyderabad', 'Sindh', 'Pakistan', 'PK')
const NEW_YORK = searchFixtureCity(
  'New York',
  'New York',
  'United States',
  'US',
  ['nyc'],
)
const BERNAU = searchFixtureCity('Bernau', 'Brandenburg', 'Germany', 'DE')

describe('cities.search', () => {
  let t: TestConvex<typeof schema>

  beforeEach(async () => {
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    // Inserted fuzzy-first so insertion order cannot explain the ranking.
    for (const city of [
      BNEI_BRAK,
      BERDYCHIV,
      HYDERABAD_PK,
      BERN,
      BERLIN,
      HYDERABAD,
      BENGALURU,
      NEW_YORK,
    ]) {
      await seedCity(t, city)
    }
    await seedCity(t, BERNAU, { isActive: false })
  })

  async function search(query: string, limit?: number) {
    return await t.query(api.cities.search, { query, limit })
  }

  it('ranks Bern and Berlin before Berdychiv, with the fuzzy alias hit last', async () => {
    const names = (await search('ber')).map((city) => city.name)

    // Bnei Brak only matches through a word of its alias ("bene berak").
    expect(names).toEqual(['Bern', 'Berlin', 'Berdychiv', 'Bnei Brak'])
  })

  it('puts the exact name first', async () => {
    const [first] = await search('  Berlin ')
    expect(first?.slug).toBe(BERLIN.slug)
  })

  it('finds a city by an exact alias', async () => {
    const [first] = await search('NYC')
    expect(first?.name).toBe('New York')
    expect((await search('bangalore'))[0]?.name).toBe('Bengaluru')
  })

  it('returns same-name cities with the fields that tell them apart', async () => {
    const results = await search('hyderabad')

    expect(
      results.map(({ name, region, country, countryCode, displayName }) => ({
        name,
        region,
        country,
        countryCode,
        displayName,
      })),
    ).toEqual([
      {
        name: 'Hyderabad',
        region: 'Sindh',
        country: 'Pakistan',
        countryCode: 'PK',
        displayName: 'Hyderabad, Sindh, Pakistan',
      },
      {
        name: 'Hyderabad',
        region: 'Telangana',
        country: 'India',
        countryCode: 'IN',
        displayName: 'Hyderabad, Telangana, India',
      },
    ])
    // Full documents, as the combobox (Doc<'cities'>) expects.
    expect(results[0]).toHaveProperty('_id')
    expect(results[0]).toHaveProperty('slug', 'hyderabad-pk')
  })

  it('never returns an inactive city', async () => {
    const results = [...(await search('bernau')), ...(await search('ber'))]
    expect(results.map((city) => city.name)).not.toContain('Bernau')
  })

  it('respects the limit', async () => {
    expect(await search('ber', 2)).toHaveLength(2)
  })

  it('ranks a prefix match with builders above earlier ones without', async () => {
    // "Bera" sorts before Berdychiv alphabetically and by length, and has no
    // stats; Berdychiv has three builders on Locatic.
    await seedCity(t, searchFixtureCity('Bera', 'Rajshahi', 'Bangladesh', 'BD'))
    await t.run(async (ctx) => {
      const berdychiv = await ctx.db
        .query('cities')
        .withIndex('by_slug', (query) => query.eq('slug', BERDYCHIV.slug))
        .unique()
      await ctx.db.patch(berdychiv!._id, {
        stats: { builderCount: 3, projectCount: 1, lastActivityAt: NOW },
      })
    })

    const names = (await search('ber')).map((city) => city.name)

    expect(names).toEqual(['Berdychiv', 'Bera', 'Bern', 'Berlin', 'Bnei Brak'])
    // Exact matches stay first regardless of activity.
    expect((await search('bern'))[0]?.name).toBe('Bern')
  })

  it('reads at most PREFIX_READ_BUDGET rows from the prefix range', async () => {
    await t.run(async (ctx) => {
      for (let index = 0; index < PREFIX_READ_BUDGET + 4; index += 1) {
        const name = `Berg ${String(index).padStart(3, '0')}`
        const displayName = `${name}, Norway`
        await ctx.db.insert('cities', {
          slug: `berg-${index}-no`,
          name,
          displayName,
          normalizedName: displayName.toLowerCase(),
          region: null,
          country: 'Norway',
          countryCode: 'NO',
          location: { lat: 0, lng: 0 },
          address: null,
          aliases: [],
          timezone: null,
          searchText: `${displayName} ${name}`,
          isActive: true,
          createdAt: NOW,
          updatedAt: NOW,
        })
      }
    })

    const rows = await t.run((ctx) => readCityPrefixCandidates(ctx.db, 'berg'))

    expect(rows).toHaveLength(PREFIX_READ_BUDGET)
    expect(rows.every((city) => city.normalizedName.startsWith('berg'))).toBe(
      true,
    )
    expect(await search('berg', 2)).toHaveLength(2)
  })
})

describe('location disclosure in lists built from other users', () => {
  let t: TestConvex<typeof schema>
  let fixture: PopulatedCityFixture

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    fixture = await seedPopulatedCity(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('discloses follow-list cities through the visibility policy', async () => {
    const { alice, dev, erin, bob } = fixture.users
    await seedFollow(t, alice, erin)
    await seedFollow(t, alice, dev)
    await seedFollow(t, alice, bob)

    const following = await t.query(api.users.publicFollowGraphPage, {
      username: 'alice',
      kind: 'following',
      paginationOpts: { numItems: 10, cursor: null },
    })
    const cityByUser = new Map(
      following.page.map((preview) => [preview.userId, preview.cityName]),
    )

    expect(cityByUser.get(erin)).toBeNull()
    expect(cityByUser.get(dev)).toBe('Karnataka, India')
    expect(cityByUser.get(bob)).toBe('Bengaluru, Karnataka, India')
  })

  it("shows no city for a hidden owner's project in the viewer's liked list", async () => {
    const { alice } = fixture.users
    const { erinService } = fixture.projects
    await t.run((ctx) =>
      ctx.db.insert('reactions', {
        userId: alice,
        targetType: 'project',
        targetId: erinService,
        reactionType: 'like',
        createdAt: daysAgo(1),
      }),
    )

    const liked = await as(t, 'alice').query(
      api.users.privateProfileLikedProjects,
      {},
    )

    expect(liked).toHaveLength(1)
    expect(liked[0]?.project).toMatchObject({
      projectId: erinService,
      cityLabel: null,
      cityVisibilityState: 'hidden',
    })
  })

  it('builds the project_posted actor snapshot through the policy', async () => {
    const { dev } = fixture.users

    await t.mutation(internal.projects.upsertImportedRepositories, {
      ownerId: dev,
      repositories: [importedRepository('dev', 'new-tool', daysAgo(2))],
    })

    const event = await t.run(async (ctx) =>
      (await ctx.db.query('activity_events').collect()).find(
        (row) => row.eventType === 'project_posted' && row.actorId === dev,
      ),
    )
    expect(event?.actorSnapshot).toMatchObject({
      cityId: null,
      cityName: 'Karnataka, India',
    })
  })
})

function importedRepository(owner: string, name: string, lastCommitAt: number) {
  const fullName = `${owner}/${name}`
  return {
    repoId: fullName.length * 7919 + name.charCodeAt(0),
    fullName,
    ownerLogin: owner,
    ownerLoginKey: owner,
    name,
    nameKey: name,
    description: null,
    githubUrl: `https://github.com/${fullName}`,
    projectUrl: null,
    primaryLanguage: 'TypeScript',
    languages: [{ name: 'TypeScript', bytes: 1000 }],
    topics: [],
    stargazersCount: 0,
    lastCommitAt,
    lastMetadataSyncedAt: lastCommitAt,
    readmePreview: null,
    readmeAssetBaseUrl: null,
    readmeAssetRootUrl: null,
    readmeLinkBaseUrl: null,
    readmeLinkRootUrl: null,
  }
}

/** A metadata refresh payload for an existing project with a new commit time. */
async function metadataRefresh(
  t: TestConvex<typeof schema>,
  projectId: Id<'projects'>,
  lastCommitAt: number,
) {
  const project = await t.run((ctx) => ctx.db.get(projectId))
  if (!project) throw new Error('project not seeded')
  const {
    commitFrequency: _commitFrequency,
    lastMetadataSyncAttemptedAt: _attemptedAt,
    ...repository
  } = project.github
  return { ...repository, lastCommitAt, lastMetadataSyncedAt: lastCommitAt }
}

function githubRelease(githubReleaseId: number, publishedAt: number | null) {
  const tagName = `v${githubReleaseId}.0.0`
  const createdAt = publishedAt ?? NOW
  return {
    githubReleaseId,
    tagName,
    name: tagName,
    body: null,
    htmlUrl: `https://github.com/example/releases/tag/${tagName}`,
    isDraft: publishedAt === null,
    isPrerelease: false,
    publishedAt,
    createdAt,
    updatedAt: createdAt,
  }
}

type ReadRecord = {
  table: string
  index: string | null
  eq: Array<[string, unknown]>
  terminal: string
  limit: unknown
}

const TERMINALS = new Set(['collect', 'take', 'first', 'unique', 'paginate'])

/** Wraps a range builder so every `.eq(field, value)` is recorded. */
function recordRange(builder: object, record: ReadRecord): object {
  return new Proxy(builder, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        if (prop === 'eq') record.eq.push([args[0] as string, args[1]])
        return recordRange(value.apply(target, args) as object, record)
      }
    },
  })
}

function recordQuery(
  query: object,
  record: ReadRecord,
  log: ReadRecord[],
): object {
  return new Proxy(query, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        if (prop === 'withIndex') {
          record.index = args[0] as string
          const range = args[1] as ((builder: object) => object) | undefined
          return recordQuery(
            value.call(
              target,
              args[0],
              range
                ? (builder: object) => range(recordRange(builder, record))
                : undefined,
            ) as object,
            record,
            log,
          )
        }
        if (typeof prop === 'string' && TERMINALS.has(prop)) {
          record.terminal = prop
          record.limit = args[0]
          log.push(record)
          return value.apply(target, args)
        }
        return recordQuery(value.apply(target, args) as object, record, log)
      }
    },
  })
}

/** A reader that logs every query: table, index, equality range, terminal. */
function recordingReader(db: DatabaseReader, log: ReadRecord[]) {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'query') {
        return (table: string) =>
          recordQuery(
            target.query(table as 'cities'),
            { table, index: null, eq: [], terminal: '', limit: undefined },
            log,
          )
      }
      const value = Reflect.get(target, prop) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as DatabaseReader
}

describe('city pages', () => {
  let t: TestConvex<typeof schema>

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function getPage(slug: string) {
    return await t.query(api.cities.getPage, { slug })
  }

  async function setLastPublicActivity(
    userId: Id<'users'>,
    lastPublicActivityAt: number,
  ) {
    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      if (!user) throw new Error('user not seeded')
      await ctx.db.patch(userId, {
        stats: { ...user.stats, lastPublicActivityAt },
      })
    })
  }

  it('returns null for an unknown slug and for an inactive city', async () => {
    await seedCity(t, { ...BERLIN, slug: 'closed-de' }, { isActive: false })

    expect(await getPage('atlantis-xx')).toBeNull()
    expect(await getPage('closed-de')).toBeNull()
  })

  it('resolves a city id to the page with its canonical slug', async () => {
    const cityId = await seedCity(t, MYSURU)

    const page = await getPage(String(cityId))

    expect(page?.city).toMatchObject({ cityId, slug: 'mysuru-in' })
  })

  it('renders an active empty city with zero counts and a nearby active city', async () => {
    const fixture = await seedPopulatedCity(t)
    const mysuru = await seedCity(t, MYSURU)
    await runRecount(t)

    const page = await getPage('mysuru-in')

    expect(page).not.toBeNull()
    expect(page?.city).toMatchObject({
      cityId: mysuru,
      name: 'Mysuru',
      regionLabel: 'Karnataka, India',
    })
    expect(page?.stats).toEqual({
      builderCount: 0,
      projectCount: 0,
      lastActivityAt: null,
    })
    expect(page?.recentWork).toEqual({ projects: [], hasMore: false })
    expect(page?.builders).toEqual([])
    expect(page?.posts).toEqual([])
    // Bengaluru (about 130 km) is suggested with its counted builders; Hyderabad is
    // active too but outside the neighbouring cells.
    expect(page?.nearby).toEqual([
      expect.objectContaining({
        cityId: fixture.cities.bengaluru,
        slug: 'bengaluru-in',
        builderCount: 3,
        projectCount: 4,
      }),
    ])
    expect(page?.nearby[0]?.distanceKm).toBeGreaterThan(100)
    expect(page?.nearby[0]?.distanceKm).toBeLessThan(160)
  })

  it('suggests nothing nearby when no neighbouring city has activity', async () => {
    await seedPopulatedCity(t)
    await runRecount(t)

    const page = await getPage('berlin-de')

    expect(page?.stats).toMatchObject({ builderCount: 0, projectCount: 0 })
    expect(page?.nearby).toEqual([])
  })

  it('fills a populated city from members only, most recent public work first', async () => {
    const fixture = await seedPopulatedCity(t)
    await runRecount(t)
    const { alice, bob, carol } = fixture.users
    await setLastPublicActivity(bob, daysAgo(2))
    await setLastPublicActivity(alice, daysAgo(1))

    const page = await getPage('bengaluru-in')

    expect(page?.stats).toEqual({
      builderCount: 3,
      projectCount: 4,
      lastActivityAt: daysAgo(1),
    })
    // Region-only dev and hidden erin: no projects, no rows, no posts.
    expect(page?.recentWork.projects.map((project) => project.repo)).toEqual([
      expect.any(String),
      expect.any(String),
      'shipit',
      'tiny-router',
    ])
    expect(
      new Set(page?.recentWork.projects.slice(0, 2).map((row) => row.repo)),
    ).toEqual(new Set(['city-notes', 'raymarch']))
    expect(page?.recentWork.hasMore).toBe(false)
    // Activity order: newest public work first, then builders without the signal.
    expect(page?.builders.map((builder) => builder.userId)).toEqual([
      alice,
      bob,
      carol,
    ])
    expect(page?.builders.find((b) => b.userId === carol)?.isNewBuilder).toBe(
      true,
    )
    expect(page?.posts.map((post) => post.postId)).toEqual([
      fixture.posts.bobCli,
    ])
    expect(page?.posts[0]?.author.location).toMatchObject({
      kind: 'city',
      cityId: fixture.cities.bengaluru,
    })
  })

  it('returns a reviewed public payload without private fields', async () => {
    await seedPopulatedCity(t)
    await runRecount(t)

    const page = await getPage('bengaluru-in')

    expect(Object.keys(page ?? {}).sort()).toEqual([
      'builders',
      'city',
      'nearby',
      'posts',
      'recentWork',
      'stats',
    ])
    expect(Object.keys(page?.builders[0] ?? {}).sort()).toEqual([
      'avatarUrl',
      'buildStatus',
      'displayName',
      'githubUsername',
      'isNewBuilder',
      'location',
      'projectsCount',
      'userId',
    ])
    expect(Object.keys(page?.posts[0] ?? {}).sort()).toEqual([
      'author',
      'body',
      'commentsCount',
      'createdAt',
      'postId',
      'project',
    ])
    const serialized = JSON.stringify(page)
    expect(serialized).not.toContain('@example.test')
    expect(serialized).not.toContain('clerk_')
  })

  it('lists builders with public profiles only', async () => {
    const fixture = await seedPopulatedCity(t)
    await t.run(async (ctx) => {
      const bob = await ctx.db.get(fixture.users.bob)
      if (!bob) throw new Error('bob not seeded')
      await ctx.db.patch(bob._id, {
        privacy: { ...bob.privacy, profileVisibility: 'locatic_only' },
      })
    })

    const page = await getPage('bengaluru-in')

    expect(page?.builders.map((builder) => builder.userId)).not.toContain(
      fixture.users.bob,
    )
  })

  it('drops a member who turns hidden from counts, builders, work and posts on the next read', async () => {
    const fixture = await seedPopulatedCity(t)
    await runRecount(t)

    await as(t, 'bob').mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'hidden',
    })
    const page = await getPage('bengaluru-in')

    expect(page?.stats?.builderCount).toBe(2)
    // Public membership/locations change immediately; stored project counters catch up.
    await finishLifecycleOwnerSync(t, fixture.users.bob)
    expect((await getPage('bengaluru-in'))?.stats?.projectCount).toBe(3)
    expect(page?.builders.map((builder) => builder.userId)).not.toContain(
      fixture.users.bob,
    )
    expect(page?.recentWork.projects.map((row) => row.repo)).not.toContain(
      'shipit',
    )
    expect(page?.posts).toEqual([])
  })

  it('keeps cities whose only residents are hidden or region-only off the map', async () => {
    const fixture = await seedPopulatedCity(t)
    const mysuru = await seedCity(t, MYSURU)
    const hidden = await seedUser(t, {
      username: 'mysuru-hidden',
      cityId: mysuru,
      cityVisibility: 'hidden',
    })
    await seedProject(t, { ownerId: hidden, name: 'quiet' })
    await seedUser(t, {
      username: 'mysuru-region',
      cityId: mysuru,
      cityVisibility: 'region_only',
    })
    await runRecount(t)

    const cellOf = async (cityId: Id<'cities'>) =>
      (await t.run((ctx) => ctx.db.get(cityId)))?.activityCell
    expect(await cellOf(mysuru)).toBeUndefined()
    expect(await cellOf(fixture.cities.berlin)).toBeUndefined()
    expect(await cellOf(fixture.cities.bengaluru)).toBe(
      getActivityCellKey(BENGALURU),
    )
    expect((await getPage('bengaluru-in'))?.nearby).toEqual([])

    // Becoming an exact-city member makes Mysuru active and nearby.
    await as(t, 'mysuru-hidden').mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'exact_city',
    })
    expect(await cellOf(mysuru)).toBe(getActivityCellKey(MYSURU))
    expect(
      (await getPage('bengaluru-in'))?.nearby.map((city) => city.cityId),
    ).toEqual([mysuru])

    // Leaving again removes the cell.
    await as(t, 'mysuru-hidden').mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'hidden',
    })
    expect(await cellOf(mysuru)).toBeUndefined()
    expect((await getPage('bengaluru-in'))?.nearby).toEqual([])
  })

  it('reads through indexes only: one paginate, bounded takes, neighbouring cells only', async () => {
    await seedPopulatedCity(t)
    await seedCity(t, MYSURU)
    await runRecount(t)

    const log: ReadRecord[] = []
    const page = await t.run((ctx) =>
      readCityPage(recordingReader(ctx.db, log), 'mysuru-in'),
    )

    expect(page).not.toBeNull()
    expect(log.length).toBeGreaterThan(0)
    for (const read of log) {
      expect(read.index, `${read.table} read without an index`).not.toBeNull()
      expect(read.terminal).not.toBe('collect')
    }
    expect(log.filter((read) => read.terminal === 'paginate')).toHaveLength(1)
    for (const read of log.filter((read) => read.terminal === 'take')) {
      // The largest documented take: 36 builder candidates.
      expect(read.limit).toBeLessThanOrEqual(36)
    }

    const cellReads = log.filter((read) => read.index === 'by_activity_cell')
    const byText = (left: unknown, right: unknown) =>
      String(left).localeCompare(String(right))
    expect(cellReads.map((read) => read.eq[0]?.[1]).sort(byText)).toEqual(
      getNeighbouringCellKeys(MYSURU).sort(byText),
    )
    expect(
      cellReads.every((read) => read.limit === NEARBY_CELL_READ_LIMIT),
    ).toBe(true)
    // Hyderabad is active but not in a neighbouring cell.
    expect(page?.nearby.map((city) => city.slug)).toEqual(['bengaluru-in'])
    expect(getNeighbouringCellKeys(MYSURU)).not.toContain(
      getActivityCellKey(HYDERABAD),
    )
  })
})

describe('landing map aggregate', () => {
  let t: TestConvex<typeof schema>

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function listForMap() {
    return await t.query(api.cities.listActiveForMap, {})
  }

  it('lists only cities with builders, busiest first, with city fields only', async () => {
    await seedPopulatedCity(t)
    // Mysuru's only residents are hidden or region-only: no counted builder.
    const mysuru = await seedCity(t, MYSURU)
    const hidden = await seedUser(t, {
      username: 'mysuru-hidden',
      cityId: mysuru,
      cityVisibility: 'hidden',
    })
    await seedProject(t, { ownerId: hidden, name: 'quiet' })
    await seedUser(t, {
      username: 'mysuru-region',
      cityId: mysuru,
      cityVisibility: 'region_only',
    })
    await runRecount(t)

    const cities = await listForMap()

    // Every dot is a city with builderCount > 0 under the maintained counters.
    for (const row of cities) {
      const stats = await t.run(async (ctx) => {
        const cityRow = await ctx.db
          .query('cities')
          .withIndex('by_slug', (query) => query.eq('slug', row.slug))
          .unique()
        return cityRow?.stats
      })
      expect(stats?.builderCount).toBe(row.builderCount)
      expect(row.builderCount).toBeGreaterThan(0)
    }
    expect(cities).toEqual([
      {
        slug: 'bengaluru-in',
        name: 'Bengaluru',
        lat: BENGALURU.lat,
        lng: BENGALURU.lng,
        builderCount: 3,
      },
      {
        slug: 'hyderabad-in',
        name: 'Hyderabad',
        lat: HYDERABAD.lat,
        lng: HYDERABAD.lng,
        builderCount: 1,
      },
    ])
  })

  it('carries no user-level data', async () => {
    await seedPopulatedCity(t)
    await runRecount(t)

    const cities = await listForMap()

    expect(cities.length).toBeGreaterThan(0)
    for (const row of cities) {
      expect(Object.keys(row).sort()).toEqual([
        'builderCount',
        'lat',
        'lng',
        'name',
        'slug',
      ])
    }
    const serialized = JSON.stringify(cities)
    for (const username of ['alice', 'bob', 'carol', 'dev', 'erin', 'frank']) {
      expect(serialized).not.toContain(username)
    }
    expect(serialized).not.toContain('@example.test')
    expect(serialized).not.toContain('clerk_')
  })

  it('drops a city when its last builder turns hidden and leaves out inactive cities', async () => {
    const fixture = await seedPopulatedCity(t)
    await runRecount(t)

    // Frank is Hyderabad's only builder.
    await as(t, 'frank').mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'hidden',
    })
    expect((await listForMap()).map((row) => row.slug)).toEqual([
      'bengaluru-in',
    ])

    await t.run((ctx) =>
      ctx.db.patch(fixture.cities.bengaluru, { isActive: false }),
    )
    expect(await listForMap()).toEqual([])
  })

  it('reads one bounded range of the activity index', async () => {
    await seedPopulatedCity(t)
    await seedCity(t, MYSURU)
    await runRecount(t)

    const log: ReadRecord[] = []
    const cities = await t.run((ctx) =>
      readActiveMapCities(recordingReader(ctx.db, log)),
    )

    expect(log).toEqual([
      {
        table: 'cities',
        index: 'by_activity_cell',
        eq: [],
        terminal: 'take',
        limit: 200,
      },
    ])
    expect(cities.map((city) => city.slug)).toEqual([
      'bengaluru-in',
      'hyderabad-in',
    ])
  })
})

describe('cities.listNearby (Explore rail)', () => {
  let t: TestConvex<typeof schema>

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the same rows as the city page, never the city itself', async () => {
    const fixture = await seedPopulatedCity(t)
    const mysuru = await seedCity(t, MYSURU)
    await runRecount(t)

    const rows = await t.query(api.cities.listNearby, { cityId: mysuru })
    const page = await t.query(api.cities.getPage, { slug: 'mysuru-in' })

    expect(rows).toEqual(page?.nearby)
    expect(rows.map((row) => row.cityId)).toEqual([fixture.cities.bengaluru])
    expect(
      await t.query(api.cities.listNearby, {
        cityId: fixture.cities.bengaluru,
      }),
    ).not.toContainEqual(
      expect.objectContaining({ cityId: fixture.cities.bengaluru }),
    )
  })

  it('returns nothing for an inactive city', async () => {
    await seedPopulatedCity(t)
    const closed = await seedCity(t, MYSURU, { isActive: false })
    await runRecount(t)

    expect(await t.query(api.cities.listNearby, { cityId: closed })).toEqual([])
  })

  it('returns nothing for a deleted city id', async () => {
    await seedPopulatedCity(t)
    const gone = await seedCity(t, MYSURU)
    await runRecount(t)
    await t.run(async (ctx) => {
      await ctx.db.delete(gone)
    })

    expect(await t.query(api.cities.listNearby, { cityId: gone })).toEqual([])
  })
})
