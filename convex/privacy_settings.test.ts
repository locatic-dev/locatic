import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  BENGALURU,
  NOW,
  fixtureClerkId,
  seedCity,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')
const PAGE = { numItems: 20, cursor: null }

// The full privacy object the Settings privacy tab sends with every change.
const privacyArgs = {
  profileVisibility: 'public' as const,
  followGraphVisibility: 'public' as const,
  commentHistoryVisibility: 'public' as const,
  likedProjectsVisibility: 'public' as const,
  contributionsVisibility: 'public' as const,
  appearInPulse: true,
}

function asMaya(t: TestConvex<typeof schema>) {
  return t.withIdentity({ subject: fixtureClerkId('maya') })
}

/**
 * Settings privacy controls (plan decision D8): "where your city shows"
 * writes `cityVisibility` through `users.updatePrivacy`, and "appear in
 * explore and city pages" writes `appearInExplore` through
 * `users.updateExploreConfig`. Both re-derive owner state, so the next read
 * reflects them.
 */
describe('settings location and discovery controls (D8)', () => {
  let t: TestConvex<typeof schema>
  let bengaluru: Id<'cities'>
  let projectId: Id<'projects'>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    bengaluru = await seedCity(t, BENGALURU)
    const maya = await seedUser(t, { username: 'maya', onboarded: false })
    // Onboarding through the real mutation maintains the city counters.
    await asMaya(t).mutation(api.users.completeOnboarding, {
      displayName: 'Maya',
      bio: '',
      cityId: bengaluru,
      exploreCityIds: [bengaluru],
      onboardingSelectedOwnedProjectIds: [],
      stackPrefs: ['rust'],
    })
    projectId = await seedProject(t, { ownerId: maya, name: 'tide' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function previewOwnerLocation() {
    const everywhere = await t.query(api.explore.listPublic, {
      paginationOpts: PAGE,
      scope: 'global',
    })
    return everywhere.page.find((row) => row.projectId === projectId)
      ?.ownerLocation
  }

  async function inCityFeed() {
    const inCity = await t.query(api.explore.listPublic, {
      paginationOpts: PAGE,
      scope: 'custom',
      selectedCityIds: [bengaluru],
    })
    return inCity.page.some((row) => row.projectId === projectId)
  }

  async function builderCount() {
    return (await t.query(api.cities.getStats, { cityId: bengaluru }))
      ?.builderCount
  }

  it('changes the project preview owner location with each city visibility', async () => {
    expect(await previewOwnerLocation()).toEqual({
      kind: 'city',
      cityId: bengaluru,
      cityName: 'Bengaluru, Karnataka, India',
      regionLabel: 'Karnataka, India',
    })
    expect(await inCityFeed()).toBe(true)

    await asMaya(t).mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'region_only',
    })
    expect(await previewOwnerLocation()).toEqual({
      kind: 'region',
      regionLabel: 'Karnataka, India',
    })
    expect(await inCityFeed()).toBe(false)
    expect(await builderCount()).toBe(0)

    await asMaya(t).mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'hidden',
    })
    expect(await previewOwnerLocation()).toEqual({ kind: 'none' })
    expect(await inCityFeed()).toBe(false)

    await asMaya(t).mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      cityVisibility: 'exact_city',
    })
    expect((await previewOwnerLocation())?.kind).toBe('city')
    expect(await inCityFeed()).toBe(true)
    expect(await builderCount()).toBe(1)
  })

  it('changes the city builder count when discovery participation toggles', async () => {
    expect(await builderCount()).toBe(1)

    await asMaya(t).mutation(api.users.updateExploreConfig, {
      cityIds: [bengaluru],
      stackPrefs: ['rust'],
      appearInExplore: false,
    })
    expect(await builderCount()).toBe(0)
    expect(await previewOwnerLocation()).toBeUndefined()

    await asMaya(t).mutation(api.users.updateExploreConfig, {
      cityIds: [bengaluru],
      stackPrefs: ['rust'],
      appearInExplore: true,
    })
    expect(await builderCount()).toBe(1)
    expect((await previewOwnerLocation())?.kind).toBe('city')
  })

  it('leaves the location disclosure alone when discovery participation changes', async () => {
    await asMaya(t).mutation(api.users.updateExploreConfig, {
      cityIds: [bengaluru],
      stackPrefs: ['rust'],
      appearInExplore: false,
    })

    const overview = await asMaya(t).query(api.users.privateProfileOverview, {})
    expect(overview.viewer.appearInExplore).toBe(false)
    expect(overview.viewer.privacy.cityVisibility).toBe('exact_city')
    expect(overview.viewer.exploreConfig).toEqual({
      cityIds: [bengaluru],
      stackPrefs: ['rust'],
    })
    // The labels the settings copy shows for exact city and region only.
    expect(overview.cityName).toBe('Bengaluru, Karnataka, India')
    expect(overview.regionLabel).toBe('Karnataka, India')
  })

  it('merges a partial privacy update over the stored settings', async () => {
    const storedPrivacy = async () =>
      (await asMaya(t).query(api.users.privateProfileOverview, {})).viewer
        .privacy
    await asMaya(t).mutation(api.users.updatePrivacy, {
      ...privacyArgs,
      followGraphVisibility: 'private',
      commentHistoryVisibility: 'private',
      cityVisibility: 'exact_city',
    })
    const before = await storedPrivacy()

    // Only the changed control is sent; the other fields keep their values.
    await asMaya(t).mutation(api.users.updatePrivacy, {
      cityVisibility: 'region_only',
    })
    expect(await storedPrivacy()).toEqual({
      ...before,
      cityVisibility: 'region_only',
    })
    // The city visibility change still re-derives owner state and counters.
    expect(await previewOwnerLocation()).toEqual({
      kind: 'region',
      regionLabel: 'Karnataka, India',
    })
    expect(await builderCount()).toBe(0)

    await asMaya(t).mutation(api.users.updatePrivacy, {
      profileVisibility: 'locatic_only',
    })
    expect(await storedPrivacy()).toEqual({
      ...before,
      cityVisibility: 'region_only',
      profileVisibility: 'locatic_only',
    })
  })

  it('propagates privacy to every project for an owner with many repositories', async () => {
    const maya = await t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('by_github_username', (query) =>
          query.eq('github.username', 'maya'),
        )
        .unique(),
    )
    for (let index = 0; index < 55; index += 1) {
      await seedProject(t, {
        ownerId: maya!._id,
        name: `repository-${index}`,
      })
    }

    await asMaya(t).mutation(api.users.updatePrivacy, {
      cityVisibility: 'hidden',
    })
    const hiddenProjects = await t.run((ctx) =>
      ctx.db
        .query('projects')
        .withIndex('by_owner', (query) => query.eq('ownerId', maya!._id))
        .collect(),
    )
    expect(hiddenProjects).toHaveLength(56)
    expect(
      hiddenProjects.every(
        (project) =>
          project.ownerSnapshot.cityId === null &&
          project.ownerSnapshot.cityName === null &&
          project.exploreOwner.cityId === null,
      ),
    ).toBe(true)
    expect(
      (await t.query(api.cities.getStats, { cityId: bengaluru }))?.projectCount,
    ).toBe(0)

    await asMaya(t).mutation(api.users.updatePrivacy, {
      cityVisibility: 'exact_city',
    })
    expect(
      (await t.query(api.cities.getStats, { cityId: bengaluru }))?.projectCount,
    ).toBe(56)
  })
})
