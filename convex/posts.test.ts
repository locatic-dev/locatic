import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  NOW,
  fixtureClerkId,
  seedPopulatedCity,
  finishLifecycleOwnerSync,
  type PopulatedCityFixture,
} from './__tests__/fixtures.helpers'

/**
 * Posts in discovery (review findings B3 and S7, decision D8). Discovery
 * participation (`appearInExplore`) decides whether a builder's work appears
 * in discovery at all; a post of an owner who opted out must not reach city
 * pages, Explore post feeds or post search, even through a stored
 * `projectCityId` written before the owner's latest change. The post stays
 * public where it belongs to the owner: the project page and the profile.
 */

const modules = import.meta.glob('./**/*.ts')
const PAGE = { cursor: null, numItems: 50 }

type T = TestConvex<typeof schema>

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

function postIds(rows: Array<{ _id: Id<'posts'> }>) {
  return rows.map((row) => row._id)
}

describe('posts of owners outside discovery (B3)', () => {
  let t: T
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

  async function discoveryPostIds() {
    const { bengaluru } = fixture.cities
    const cityPage = await t.query(api.cities.getPage, { slug: 'bengaluru-in' })
    const publicGlobal = await t.query(api.explore.listPostsPublic, {
      paginationOpts: PAGE,
      scope: 'global',
    })
    const publicCity = await t.query(api.explore.listPostsPublic, {
      paginationOpts: PAGE,
      scope: 'custom',
      selectedCityIds: [bengaluru],
    })
    const memberGlobal = await as(t, 'alice').query(api.explore.listPosts, {
      paginationOpts: PAGE,
      scope: 'global',
    })
    const memberCity = await as(t, 'alice').query(api.explore.listPosts, {
      paginationOpts: PAGE,
      scope: 'custom',
      selectedCityIds: [bengaluru],
    })
    const memberSearch = await as(t, 'alice').query(api.explore.searchPosts, {
      q: 'channels',
    })
    const publicSearch = await t.query(api.posts.search, { q: 'channels' })

    return {
      cityPage: cityPage?.posts.map((post) => post.postId) ?? [],
      publicGlobal: postIds(publicGlobal.page),
      publicCity: postIds(publicCity.page),
      memberGlobal: postIds(memberGlobal.page),
      memberCity: postIds(memberCity.page),
      memberSearch: postIds(memberSearch.posts),
      publicSearch: postIds(publicSearch),
    }
  }

  it('keeps an opted-out exact-city poster out of every discovery surface', async () => {
    const { gwenBot } = fixture.posts
    const surfaces = await discoveryPostIds()

    for (const [surface, ids] of Object.entries(surfaces)) {
      expect({ surface, hasGwen: ids.includes(gwenBot) }).toEqual({
        surface,
        hasGwen: false,
      })
    }

    // Control: once gwen opts back in, every surface lists the post, so the
    // absence above is the discovery rule and not an empty surface.
    const gwen = await t.run((ctx) => ctx.db.get(fixture.users.gwen))
    await as(t, 'gwen').mutation(api.users.updateExploreConfig, {
      cityIds: gwen!.exploreConfig.cityIds,
      stackPrefs: gwen!.exploreConfig.stackPrefs,
      appearInExplore: true,
    })
    await finishLifecycleOwnerSync(t, fixture.users.gwen)
    for (const [surface, ids] of Object.entries(await discoveryPostIds())) {
      expect({ surface, hasGwen: ids.includes(gwenBot) }).toEqual({
        surface,
        hasGwen: true,
      })
    }
  })

  it('keeps the post out even when its stored projectCityId predates the opt-out', async () => {
    const { gwenBot } = fixture.posts
    // A row written before the fix (or before the owner-state backfill).
    await t.run((ctx) =>
      ctx.db.patch(gwenBot, { projectCityId: fixture.cities.bengaluru }),
    )

    const surfaces = await discoveryPostIds()
    for (const ids of Object.values(surfaces)) {
      expect(ids).not.toContain(gwenBot)
    }
  })

  it('still shows the post on the project page and the profile', async () => {
    const { gwenBot } = fixture.posts
    const projectPosts = await t.query(api.posts.listByProject, {
      projectId: fixture.projects.gwenBot,
      paginationOpts: PAGE,
    })
    expect(postIds(projectPosts.page)).toEqual([gwenBot])

    const shippingLog = await t.query(api.users.publicProfileShippingLog, {
      username: 'gwen',
    })
    expect(shippingLog?.map((entry) => entry.id)).toContain(String(gwenBot))
  })

  it('writes no city on posts of opted-out owners and clears it when an owner opts out', async () => {
    const created = await as(t, 'gwen').mutation(api.posts.create, {
      projectId: fixture.projects.gwenBot,
      body: 'Another update',
    })
    expect(created?.projectCityId).toBeNull()

    const bob = await t.run((ctx) => ctx.db.get(fixture.users.bob))
    await as(t, 'bob').mutation(api.users.updateExploreConfig, {
      cityIds: bob!.exploreConfig.cityIds,
      stackPrefs: bob!.exploreConfig.stackPrefs,
      appearInExplore: false,
    })

    await finishLifecycleOwnerSync(t, fixture.users.bob)
    const bobPost = await t.run((ctx) => ctx.db.get(fixture.posts.bobCli))
    expect(bobPost?.projectCityId).toBeNull()
    const cityPage = await t.query(api.cities.getPage, { slug: 'bengaluru-in' })
    expect(cityPage?.posts.map((post) => post.postId)).not.toContain(
      fixture.posts.bobCli,
    )
  })
})

describe('stale stored post fields (S7)', () => {
  let t: T
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

  it('serves the live actor location on member post feeds, not the stored snapshot', async () => {
    const { erinService } = fixture.posts
    // erin is hidden; a snapshot written while she disclosed her city.
    await t.run((ctx) =>
      ctx.db.patch(erinService, {
        actorSnapshot: {
          displayName: 'erin',
          avatarUrl: 'https://avatars.example.test/erin.png',
          cityId: fixture.cities.bengaluru,
          cityName: 'Bengaluru, Karnataka, India',
        },
      }),
    )

    const { page } = await as(t, 'alice').query(api.explore.listPosts, {
      paginationOpts: PAGE,
      scope: 'global',
    })
    const erinRow = page.find((post) => post._id === erinService)
    expect(erinRow?.actorSnapshot).toMatchObject({
      cityId: null,
      cityName: null,
    })
  })

  it('drops a region-only owner post from a city feed despite a stale stored city', async () => {
    const { devTool } = fixture.posts
    await t.run((ctx) =>
      ctx.db.patch(devTool, { projectCityId: fixture.cities.bengaluru }),
    )

    const memberCity = await as(t, 'alice').query(api.explore.listPosts, {
      paginationOpts: PAGE,
      scope: 'custom',
      selectedCityIds: [fixture.cities.bengaluru],
    })
    expect(postIds(memberCity.page)).not.toContain(devTool)
    const cityPage = await t.query(api.cities.getPage, { slug: 'bengaluru-in' })
    expect(cityPage?.posts.map((post) => post.postId)).not.toContain(devTool)
  })
})
