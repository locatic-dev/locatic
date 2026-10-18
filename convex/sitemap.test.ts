import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import {
  NOW,
  seedCities,
  seedProject,
  seedUser,
  type SeededCities,
} from './__tests__/fixtures.helpers'
import { getCityActivityCell } from './lib/cityStats'
import { SITEMAP_PAGE_SIZE } from './sitemap'

/**
 * /sitemap.xml lists only pages a signed-out visitor can open: it is a
 * privacy contract, so hidden projects, gone owners and `locatic_only`
 * profiles must stay out.
 */

const modules = import.meta.glob('./**/*.ts')

type T = TestConvex<typeof schema>

describe('sitemap entries', () => {
  let t: T
  let cities: SeededCities

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    cities = await seedCities(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function allPages(
    listing: typeof api.sitemap.projects | typeof api.sitemap.profiles,
    numItems = 200,
  ) {
    const paths: string[] = []
    let cursor: string | null = null
    for (;;) {
      const page: {
        entries: Array<{ path: string }>
        continueCursor: string
        isDone: boolean
      } = await t.query(listing, {
        paginationOpts: { numItems, cursor },
      })
      paths.push(...page.entries.map((entry) => entry.path))
      if (page.isDone) {
        return paths
      }
      cursor = page.continueCursor
    }
  }

  async function paths() {
    const cities = await t.query(api.sitemap.cities, {})
    return {
      cities: cities.map((entry) => entry.path),
      projects: await allPages(api.sitemap.projects),
      profiles: await allPages(api.sitemap.profiles),
    }
  }

  /** Every listed profile must open for a signed-out visitor. */
  async function expectProfilesOpenSignedOut(profilePaths: string[]) {
    for (const path of profilePaths) {
      const username = path.replace('/u/', '')
      const profile = await t.query(api.users.publicProfile, {
        username,
      })
      expect(profile, path).not.toBeNull()
    }
  }

  it('lists visible projects and their public owners', async () => {
    const ada = await seedUser(t, {
      username: 'ada',
      cityId: cities.bengaluru,
      projectsCount: 1,
    })
    await seedProject(t, { ownerId: ada, name: 'engine' })

    const result = await paths()
    expect(result.projects).toEqual(['/project/ada/engine'])
    expect(result.profiles).toEqual(['/u/ada'])
    await expectProfilesOpenSignedOut(result.profiles)
  })

  it('skips unfinished onboarding and builders without a visible project', async () => {
    await seedUser(t, { username: 'lin', projectsCount: 1 })
    await seedUser(t, { username: 'new', onboarded: false, projectsCount: 1 })
    // Thin: a public profile with nothing to show stays out of the index.
    await seedUser(t, { username: 'empty' })

    expect((await paths()).profiles).toEqual(['/u/lin'])
  })

  it('walks pages and never reads more than a bounded page', async () => {
    const ada = await seedUser(t, { username: 'ada' })
    for (const name of ['one', 'two', 'three', 'four', 'five']) {
      await seedProject(t, { ownerId: ada, name })
    }

    expect(await allPages(api.sitemap.projects, 2)).toHaveLength(5)
    const page = await t.query(api.sitemap.projects, {
      paginationOpts: { numItems: 100_000, cursor: null },
    })
    expect(page.entries.length).toBeLessThanOrEqual(SITEMAP_PAGE_SIZE)
  })

  it('leaves out hidden projects and members-only profiles', async () => {
    const ada = await seedUser(t, { username: 'ada', projectsCount: 1 })
    await seedProject(t, { ownerId: ada, name: 'hidden', isVisible: false })
    const grace = await seedUser(t, {
      username: 'grace',
      profileVisibility: 'locatic_only',
      projectsCount: 1,
    })
    await seedProject(t, { ownerId: grace, name: 'compiler' })

    const result = await paths()
    // The project page is public; the owner's profile is not.
    expect(result.projects).toEqual(['/project/grace/compiler'])
    expect(result.profiles).toEqual(['/u/ada'])
    await expectProfilesOpenSignedOut(result.profiles)
  })

  it('leaves out projects and profiles of deactivated or deleted owners', async () => {
    const ada = await seedUser(t, { username: 'ada' })
    await seedProject(t, { ownerId: ada, name: 'engine' })
    const bob = await seedUser(t, { username: 'bob' })
    await seedProject(t, { ownerId: bob, name: 'tool' })
    await t.run(async (ctx) => {
      await ctx.db.patch(ada, { deactivatedAt: NOW })
      await ctx.db.patch(bob, { deletedAt: NOW })
    })

    expect(await paths()).toMatchObject({ projects: [], profiles: [] })
  })

  it('lists active cities with three or more builders, dated by activity', async () => {
    // City counters are maintained by mutations; set them as a recount would.
    await t.run(async (ctx) => {
      for (const [cityId, builderCount] of [
        [cities.berlin, 3],
        [cities.hyderabad, 2],
      ] as const) {
        const city = (await ctx.db.get(cityId))!
        const stats = { builderCount, projectCount: 0, lastActivityAt: NOW }
        await ctx.db.patch(cityId, {
          stats,
          activityCell: getCityActivityCell(city, stats),
        })
      }
    })

    const entries = await t.query(api.sitemap.cities, {})
    // Hyderabad is thin; Bengaluru has no builders at all.
    expect(entries).toEqual([{ path: '/c/berlin-de', updatedAt: NOW }])
  })
})
