import { convexTest, type TestConvex } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'

import { api } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import schema from '../../schema'
import {
  NOW,
  fixtureClerkId,
  seedFollow,
  seedUser,
} from '../../__tests__/fixtures.helpers'

const modules = import.meta.glob('../../**/*.ts')
const PAGE = { numItems: 20, cursor: null }

describe('raw follow graph queries', () => {
  let t: TestConvex<typeof schema>
  let ownerId: Id<'users'>
  let followedId: Id<'users'>

  beforeEach(async () => {
    t = convexTest(schema, modules)
    ownerId = await seedUser(t, { username: 'owner' })
    followedId = await seedUser(t, { username: 'followed' })
    const followerId = await seedUser(t, { username: 'follower' })
    await seedFollow(t, followerId, ownerId)
    await seedFollow(t, ownerId, followedId)
    await t.run(async (ctx) => {
      const owner = await ctx.db.get(ownerId)
      await ctx.db.patch(ownerId, {
        privacy: { ...owner!.privacy, followGraphVisibility: 'private' },
      })
    })
  })

  for (const queryName of ['listFollowers', 'listFollowing'] as const) {
    it(`rejects signed-out ${queryName} reads`, async () => {
      await expect(
        t.query(api.follows[queryName], { userId: ownerId }),
      ).rejects.toThrow('Unauthorized')
    })

    it(`rejects another member's ${queryName} reads`, async () => {
      const unrelated = t.withIdentity({
        subject: fixtureClerkId('followed'),
      })
      await expect(
        unrelated.query(api.follows[queryName], { userId: ownerId }),
      ).rejects.toThrow('Unauthorized')
    })

    it(`keeps raw ${queryName} rows private when the public graph is enabled`, async () => {
      await t.run(async (ctx) => {
        const owner = await ctx.db.get(ownerId)
        await ctx.db.patch(ownerId, {
          privacy: { ...owner!.privacy, followGraphVisibility: 'public' },
        })
      })
      const unrelated = t.withIdentity({
        subject: fixtureClerkId('followed'),
      })
      await expect(
        unrelated.query(api.follows[queryName], { userId: ownerId }),
      ).rejects.toThrow('Unauthorized')
    })

    it(`lets a deactivated owner read their own ${queryName} state`, async () => {
      await t.run((ctx) => ctx.db.patch(ownerId, { deactivatedAt: NOW }))
      const owner = t.withIdentity({ subject: fixtureClerkId('owner') })
      expect(
        await owner.query(api.follows[queryName], { userId: ownerId }),
      ).toHaveLength(1)
      const graph = await t.query(api.users.publicFollowGraphPage, {
        username: 'owner',
        kind: 'followers',
        paginationOpts: PAGE,
      })
      expect(graph.page).toEqual([])
    })

    for (const field of ['deletedAt', 'purgedAt'] as const) {
      it(`rejects ${queryName} reads by a ${field} account`, async () => {
        await t.run((ctx) => ctx.db.patch(ownerId, { [field]: NOW }))
        const owner = t.withIdentity({ subject: fixtureClerkId('owner') })
        await expect(
          owner.query(api.follows[queryName], { userId: ownerId }),
        ).rejects.toThrow()
      })
    }
  }

  it('lets the viewer load their own following state for Explore', async () => {
    const owner = t.withIdentity({ subject: fixtureClerkId('owner') })
    const following = await owner.query(api.follows.listFollowing, {
      userId: ownerId,
    })

    expect(following).toHaveLength(1)
    expect(following[0]).toMatchObject({
      followerId: ownerId,
      followingId: followedId,
    })
  })

  it('keeps the viewer able to read their own private followers', async () => {
    const owner = t.withIdentity({ subject: fixtureClerkId('owner') })
    const followers = await owner.query(api.follows.listFollowers, {
      userId: ownerId,
    })

    expect(followers).toHaveLength(1)
    expect(followers[0]?.followingId).toBe(ownerId)
  })

  it('keeps private graphs closed through the canonical public endpoint', async () => {
    for (const kind of ['followers', 'following'] as const) {
      const graph = await t.query(api.users.publicFollowGraphPage, {
        username: 'owner',
        kind,
        paginationOpts: PAGE,
      })
      expect(graph.page).toEqual([])
    }
  })

  it('keeps permitted public graphs available through the canonical endpoint', async () => {
    await t.run(async (ctx) => {
      const owner = await ctx.db.get(ownerId)
      await ctx.db.patch(ownerId, {
        privacy: { ...owner!.privacy, followGraphVisibility: 'public' },
      })
    })
    for (const kind of ['followers', 'following'] as const) {
      const graph = await t.query(api.users.publicFollowGraphPage, {
        username: 'owner',
        kind,
        paginationOpts: PAGE,
      })
      expect(graph.page).toHaveLength(1)
    }
  })
})
