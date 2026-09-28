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
  seedUser,
  type PopulatedCityFixture,
} from './__tests__/fixtures.helpers'

/**
 * Comment author locations (review finding B2, decision D8). A comment stores
 * `authorSnapshot` when it is written, and nothing re-derives it when the
 * author later changes their privacy, so the list queries must resolve the
 * author's location from the live user.
 */

const modules = import.meta.glob('./**/*.ts')
const PAGE = { cursor: null, numItems: 20 }

type T = TestConvex<typeof schema>

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

async function listRoots(t: T, projectId: Id<'projects'>) {
  const { page } = await t.query(api.comments.listRootsByTarget, {
    targetType: 'project',
    targetId: String(projectId),
    sort: 'newest',
    paginationOpts: PAGE,
  })
  return page
}

function locationOf(comment: {
  authorSnapshot: { cityId: Id<'cities'> | null; cityName: string | null }
}) {
  return {
    cityId: comment.authorSnapshot.cityId,
    cityName: comment.authorSnapshot.cityName,
  }
}

describe('comment author location (B2)', () => {
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

  it('serves each author location under the policy: city with id, region label, nothing', async () => {
    const { aliceApp } = fixture.projects
    const berta = await seedUser(t, {
      username: 'berta',
      cityId: fixture.cities.berlin,
      cityVisibility: 'region_only',
    })
    for (const username of ['alice', 'dev', 'erin', 'berta']) {
      await as(t, username).mutation(api.comments.create, {
        targetType: 'project',
        targetId: String(aliceApp),
        parentId: null,
        content: `hello from ${username}`,
      })
    }

    const byAuthor = new Map(
      (await listRoots(t, aliceApp)).map((comment) => [
        String(comment.authorId),
        locationOf(comment),
      ]),
    )

    expect(byAuthor.get(String(fixture.users.alice))).toEqual({
      cityId: fixture.cities.bengaluru,
      cityName: 'Bengaluru, Karnataka, India',
    })
    expect(byAuthor.get(String(fixture.users.dev))).toEqual({
      cityId: null,
      cityName: 'Karnataka, India',
    })
    expect(byAuthor.get(String(fixture.users.erin))).toEqual({
      cityId: null,
      cityName: null,
    })
    // Catalogue region "State of Berlin" names the city (B1): country only.
    expect(byAuthor.get(String(berta))).toEqual({
      cityId: null,
      cityName: 'Germany',
    })
  })

  it('never serves an exact snapshot stored before the author turned hidden or region-only', async () => {
    const { aliceApp } = fixture.projects
    const alice = as(t, 'alice')
    const root = await alice.mutation(api.comments.create, {
      targetType: 'project',
      targetId: String(aliceApp),
      parentId: null,
      content: 'root',
    })
    const reply = await alice.mutation(api.comments.create, {
      targetType: 'project',
      targetId: String(aliceApp),
      parentId: root!._id,
      content: 'reply',
    })
    // The stored snapshots hold the exact city.
    const stored = await t.run((ctx) => ctx.db.get(reply!._id))
    expect(stored?.authorSnapshot.cityId).toBe(fixture.cities.bengaluru)

    await alice.mutation(api.users.updatePrivacy, { cityVisibility: 'hidden' })

    const [rootRow] = await listRoots(t, aliceApp)
    expect(locationOf(rootRow)).toEqual({ cityId: null, cityName: null })
    expect(
      (rootRow.previewReplies ?? []).map((row) =>
        locationOf(row as typeof rootRow),
      ),
    ).toEqual([{ cityId: null, cityName: null }])
    const replies = await t.query(api.comments.listReplies, {
      parentId: root!._id,
      paginationOpts: PAGE,
    })
    expect(replies.page.map(locationOf)).toEqual([
      { cityId: null, cityName: null },
    ])

    await alice.mutation(api.users.updatePrivacy, {
      cityVisibility: 'region_only',
    })
    expect(locationOf((await listRoots(t, aliceApp))[0])).toEqual({
      cityId: null,
      cityName: 'Karnataka, India',
    })
  })

  it('discloses nothing for an author whose account is gone', async () => {
    const { aliceApp } = fixture.projects
    await as(t, 'bob').mutation(api.comments.create, {
      targetType: 'project',
      targetId: String(aliceApp),
      parentId: null,
      content: 'from bob',
    })
    await t.run((ctx) =>
      ctx.db.patch(fixture.users.bob, { deactivatedAt: NOW }),
    )

    const [row] = await listRoots(t, aliceApp)
    expect(locationOf(row)).toEqual({ cityId: null, cityName: null })
  })
})
