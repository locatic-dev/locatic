import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  BERLIN,
  NOW,
  daysAgo,
  fixtureClerkId,
  seedCity,
  seedEmptyCity,
  seedFollow,
  seedPopulatedCity,
  seedPrivacyVariants,
  seedUser,
  type PopulatedCityFixture,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')

function as(t: TestConvex<typeof schema>, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

async function userIdOf(t: TestConvex<typeof schema>, username: string) {
  const user = await t.run((ctx) =>
    ctx.db
      .query('users')
      .withIndex('by_clerk_id', (query) =>
        query.eq('clerkId', fixtureClerkId(username)),
      )
      .unique(),
  )
  if (!user) throw new Error(`missing fixture user ${username}`)
  return user._id
}

async function setLastPublicActivityAt(
  t: TestConvex<typeof schema>,
  userId: Id<'users'>,
  lastPublicActivityAt: number,
) {
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId)
    if (!user) throw new Error('missing fixture user')
    await ctx.db.patch(userId, {
      stats: { ...user.stats, lastPublicActivityAt },
    })
  })
}

async function suggestions(
  t: TestConvex<typeof schema>,
  viewer: string,
  cityId: Id<'cities'>,
) {
  return await as(t, viewer).query(api.users.suggestOnboardingBuilders, {
    cityId,
  })
}

describe('onboarding builder suggestions (D7, D8)', () => {
  let t: TestConvex<typeof schema>
  let fixture: PopulatedCityFixture

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    fixture = await seedPopulatedCity(t)
    await seedUser(t, { username: 'newbie', onboarded: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists exact-city members of the chosen city only, as public identities', async () => {
    const { bengaluru } = fixture.cities
    const { alice, bob, carol } = fixture.users

    const result = await suggestions(t, 'newbie', bengaluru)

    // D4 order. The fixture records no public activity signal, so every
    // builder is in the unset group: newest account first.
    expect(result.map((builder) => builder.userId)).toEqual([carol, bob, alice])
    expect(result.map((builder) => builder.isNewBuilder)).toEqual([
      true,
      false,
      false,
    ])
    for (const builder of result) {
      expect(builder.location).toMatchObject({
        kind: 'city',
        cityId: bengaluru,
      })
      expect(builder.viewerIsFollowing).toBe(false)
      expect(Object.keys(builder).sort()).toEqual(
        [
          'avatarUrl',
          'buildStatus',
          'displayName',
          'githubUsername',
          'isNewBuilder',
          'location',
          'projectsCount',
          'userId',
          'viewerIsFollowing',
        ].sort(),
      )
    }
  })

  it('never suggests the viewer', async () => {
    const { bengaluru } = fixture.cities
    const { alice, bob, carol } = fixture.users

    const ids = (await suggestions(t, 'alice', bengaluru)).map(
      (builder) => builder.userId,
    )

    expect(ids).toEqual([carol, bob])
    expect(ids).not.toContain(alice)
  })

  it('leaves out hidden, region-only and non-participating users', async () => {
    const berlin = fixture.cities.berlin
    const variants = await seedPrivacyVariants(t, berlin)

    const ids = (await suggestions(t, 'newbie', berlin)).map(
      (builder) => builder.userId,
    )

    expect(ids).toEqual([variants.users['exact_city:explore']])
    // The populated fixture's Bengaluru region-only and hidden users too.
    const bengaluruIds = (
      await suggestions(t, 'newbie', fixture.cities.bengaluru)
    ).map((builder) => builder.userId)
    expect(bengaluruIds).not.toContain(fixture.users.dev)
    expect(bengaluruIds).not.toContain(fixture.users.erin)
  })

  it('returns [] for a city with no other eligible builder', async () => {
    const empty = await seedEmptyCity(t)

    expect(await suggestions(t, 'newbie', fixture.cities.berlin)).toEqual([])
    // The city's only resident is the viewer.
    expect(await suggestions(t, 'mysuru-solo', empty.cityId)).toEqual([])
  })

  it('caps the list at five and keeps followed builders, marked as followed', async () => {
    const city = await seedCity(t, { ...BERLIN, slug: 'berlin-cap-test' })
    const members: Array<Id<'users'>> = []
    for (let index = 0; index < 7; index += 1) {
      members.push(
        await seedUser(t, {
          username: `member-${index}`,
          cityId: city,
          createdAt: daysAgo(70 - index),
        }),
      )
    }
    await seedFollow(t, await userIdOf(t, 'newbie'), members[5])

    const result = await suggestions(t, 'newbie', city)

    // No activity signal yet: newest account first.
    expect(result.map((builder) => builder.userId)).toEqual(
      [...members].reverse().slice(0, 5),
    )
    expect(result.map((builder) => builder.viewerIsFollowing)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ])
  })

  it('orders by most recent public work, not followers (D4)', async () => {
    const city = await seedCity(t, { ...BERLIN, slug: 'berlin-rank-test' })
    // Seeded oldest account first, as sign-ups insert them.
    const popularIdle = await seedUser(t, {
      username: 'popular-idle',
      cityId: city,
      followersCount: 500,
      createdAt: daysAgo(400),
    })
    const quietVeteran = await seedUser(t, {
      username: 'quiet-veteran',
      cityId: city,
      followersCount: 3,
      createdAt: daysAgo(300),
    })
    const newcomer = await seedUser(t, {
      username: 'newcomer',
      cityId: city,
      createdAt: daysAgo(5),
    })
    const activeNew = await seedUser(t, {
      username: 'active-new',
      cityId: city,
      createdAt: daysAgo(2),
    })
    const departed = await seedUser(t, {
      username: 'departed',
      cityId: city,
      createdAt: daysAgo(1),
    })
    await setLastPublicActivityAt(t, quietVeteran, daysAgo(20))
    await setLastPublicActivityAt(t, activeNew, daysAgo(1))
    await setLastPublicActivityAt(t, departed, NOW)
    // Legacy row still flagged as discoverable after deactivation.
    await t.run((ctx) => ctx.db.patch(departed, { deactivatedAt: NOW }))

    const result = await suggestions(t, 'newbie', city)

    // Active builders by recency, then builders without public work, newest
    // account first; the follower count plays no part.
    expect(result.map((builder) => builder.userId)).toEqual([
      activeNew,
      quietVeteran,
      newcomer,
      popularIdle,
    ])
    expect(result.map((builder) => builder.isNewBuilder)).toEqual([
      true,
      false,
      true,
      false,
    ])
  })
})

describe('completeOnboarding (U5)', () => {
  let t: TestConvex<typeof schema>

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const baseArgs = {
    displayName: 'New Builder',
    bio: '',
    onboardingSelectedOwnedProjectIds: [],
    stackPrefs: [],
  }

  it('completes without a city and keeps the default status when skipped', async () => {
    const userId = await seedUser(t, {
      username: 'newbie',
      onboarded: false,
      buildStatus: 'just_exploring',
    })

    await as(t, 'newbie').mutation(api.users.completeOnboarding, {
      ...baseArgs,
      cityId: null,
      exploreCityIds: [],
    })

    const user = await t.run((ctx) => ctx.db.get(userId))
    expect(user?.onboardingCompletedAt).toBe(NOW)
    expect(user?.profile.cityId).toBeNull()
    expect(user?.profile.buildStatus).toBe('just_exploring')
    expect(user?.exploreConfig.cityIds).toEqual([])
    const bootstrap = await as(t, 'newbie').query(api.users.viewerBootstrap, {})
    expect(bootstrap.needsOnboarding).toBe(false)
  })

  it('saves the chosen city and status', async () => {
    const city = await seedCity(t, BERLIN)
    const userId = await seedUser(t, { username: 'newbie', onboarded: false })

    await as(t, 'newbie').mutation(api.users.completeOnboarding, {
      ...baseArgs,
      cityId: city,
      buildStatus: 'hiring',
      exploreCityIds: [city],
    })

    const user = await t.run((ctx) => ctx.db.get(userId))
    expect(user?.profile.cityId).toBe(city)
    expect(user?.profile.buildStatus).toBe('hiring')
    expect(user?.exploreConfig.cityIds).toEqual([city])
  })

  it('rejects a city that does not exist', async () => {
    const city = await seedCity(t, BERLIN)
    await t.run((ctx) => ctx.db.delete(city))
    await seedUser(t, { username: 'newbie', onboarded: false })

    await expect(
      as(t, 'newbie').mutation(api.users.completeOnboarding, {
        ...baseArgs,
        cityId: city,
        exploreCityIds: [city],
      }),
    ).rejects.toThrow(/City not found/)
  })
})
