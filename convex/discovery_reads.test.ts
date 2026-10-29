import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  ACTIVITY_PROJECT_SCAN_LIMIT,
  computeLastPublicActivityAt,
  recomputeProjectPublicActivity,
} from './lib/activity'
import { EXPLORE_PAGE_MAX_ITEMS } from './lib/explore'
import {
  NOW,
  daysAgo,
  fixtureClerkId,
  seedPopulatedCity,
  seedPost,
  seedProject,
  seedRelease,
  seedUser,
  type PopulatedCityFixture,
} from './__tests__/fixtures.helpers'

/**
 * Read bounds and order on discovery and profile reads: public page sizes are clamped, "newest" reads really read the
 * newest rows, and stored owner fields that predate an owner's latest change
 * never decide what a city surface shows.
 */

const modules = import.meta.glob('./**/*.ts')

type T = TestConvex<typeof schema>

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

let t: T
let fixture: PopulatedCityFixture

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  t = convexTest(schema, modules)
  fixture = await seedPopulatedCity(t)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Explore page size', () => {
  it('clamps a requested page of 5000 to 50 rows on public feeds', async () => {
    for (let index = 0; index < EXPLORE_PAGE_MAX_ITEMS + 5; index += 1) {
      await seedPost(t, fixture.projects.bobCli, fixture.users.bob, daysAgo(1))
    }
    const huge = { cursor: null, numItems: 5000 }

    const posts = await t.query(api.explore.listPostsPublic, {
      paginationOpts: huge,
      scope: 'global',
    })
    expect(posts.page).toHaveLength(EXPLORE_PAGE_MAX_ITEMS)
    expect(posts.isDone).toBe(false)

    // The project and builder feeds go through the same clamp.
    const projects = await t.query(api.explore.listPublic, {
      paginationOpts: huge,
    })
    expect(projects.page.length).toBeLessThanOrEqual(EXPLORE_PAGE_MAX_ITEMS)
    const builders = await t.query(api.explore.listNearbyBuildersPublic, {
      cityIds: [],
      paginationOpts: huge,
    })
    expect(builders.page.length).toBeLessThanOrEqual(EXPLORE_PAGE_MAX_ITEMS)
  })
})

describe('newest-first owner reads', () => {
  async function seedManyProjects(
    ownerId: Id<'users'>,
    count: number,
    lastCommitAt: number,
  ) {
    const ids: Array<Id<'projects'>> = []
    for (let index = 0; index < count; index += 1) {
      ids.push(
        await seedProject(t, {
          ownerId,
          name: `repo-${index}`,
          lastCommitAt,
        }),
      )
    }
    return ids
  }

  it("appends the viewer's newest projects to their selected city", async () => {
    // alice already has two projects; ten more push the newest past a
    // take(10) that read oldest first.
    const added = await seedManyProjects(fixture.users.alice, 10, daysAgo(2))
    const newest = added.at(-1)!

    const result = await as(t, 'alice').query(api.explore.list, {
      paginationOpts: { cursor: null, numItems: 50 },
      scope: 'custom',
      selectedCityIds: [fixture.cities.bengaluru],
    })
    const own = result.page
      .filter((row) => row.isViewerProject)
      .map((row) => row.projectId)
    expect(own).toContain(newest)
  })

  it('builds the shipping log from the newest visible projects', async () => {
    const ownerId = await seedUser(t, {
      username: 'prolific',
      cityId: fixture.cities.bengaluru,
    })
    const projects = await seedManyProjects(ownerId, 25, daysAgo(40))
    const newest = projects.at(-1)!
    await t.run((ctx) =>
      ctx.db.get(newest).then((project) =>
        ctx.db.patch(newest, {
          github: { ...project!.github, lastCommitAt: daysAgo(1) },
        }),
      ),
    )
    const releaseId = await seedRelease(t, newest, daysAgo(1))

    const log = await t.query(api.users.publicProfileShippingLog, {
      username: 'prolific',
    })
    expect(log?.map((entry) => entry.id)).toContain(String(releaseId))
  })

  it('recomputes activity from the newest projects and clamps future times', async () => {
    const ownerId = await seedUser(t, { username: 'busy' })
    const projects = await seedManyProjects(
      ownerId,
      ACTIVITY_PROJECT_SCAN_LIMIT + 1,
      daysAgo(30),
    )
    const newest = projects.at(-1)!
    const setCommit = (lastCommitAt: number) =>
      t.run(async (ctx) => {
        const project = await ctx.db.get(newest)
        await ctx.db.patch(newest, {
          github: { ...project!.github, lastCommitAt },
        })
        await recomputeProjectPublicActivity(ctx.db, newest)
      })

    await setCommit(daysAgo(1))
    expect(
      await t.run((ctx) => computeLastPublicActivityAt(ctx.db, ownerId, NOW)),
    ).toBe(daysAgo(1))

    await setCommit(NOW + 10 * 24 * 60 * 60 * 1000)
    expect(
      await t.run((ctx) => computeLastPublicActivityAt(ctx.db, ownerId, NOW)),
    ).toBe(NOW)
  })
})

describe('stale stored owner fields on city project reads', () => {
  /** Rows written before an owner's latest change was re-derived. */
  async function makeStaleCityMember(projectId: Id<'projects'>) {
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      await ctx.db.patch(projectId, {
        exploreOwner: {
          ...project!.exploreOwner,
          cityId: fixture.cities.bengaluru,
          appearInExplore: true,
          isEligible: true,
        },
      })
    })
  }

  it('keeps "more from the city" to live discoverable members', async () => {
    const { gwenBot, devTool, bobCli } = fixture.projects
    await makeStaleCityMember(gwenBot)
    await makeStaleCityMember(devTool)

    const more = await t.query(api.projects.listMoreFromOwnerCity, {
      projectId: fixture.projects.aliceApp,
    })
    const ids = more?.projects.map((project) => project.projectId) ?? []
    expect(ids).toContain(bobCli)
    expect(ids).not.toContain(gwenBot)
    expect(ids).not.toContain(devTool)
  })

  it('keeps project search to live discoverable members', async () => {
    const { gwenBot, devTool } = fixture.projects
    await makeStaleCityMember(gwenBot)
    await makeStaleCityMember(devTool)
    const alice = as(t, 'alice')

    const standup = await alice.query(api.explore.searchProjects, {
      q: 'standup',
    })
    expect(standup.projects.map((project) => project.projectId)).toEqual([])
    const standupInCity = await alice.query(api.explore.searchProjects, {
      q: 'standup',
      cityIds: [fixture.cities.bengaluru],
    })
    expect(standupInCity.projects).toEqual([])
    const envDoctorInCity = await alice.query(api.explore.searchProjects, {
      q: 'env-doctor',
      cityIds: [fixture.cities.bengaluru],
    })
    expect(envDoctorInCity.projects).toEqual([])

    // Control: the same search finds a live member's project.
    const shipit = await alice.query(api.explore.searchProjects, {
      q: 'shipit',
      cityIds: [fixture.cities.bengaluru],
    })
    expect(shipit.projects.map((project) => project.projectId)).toEqual([
      fixture.projects.bobCli,
    ])
  })
})
