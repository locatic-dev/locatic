import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getActionErrorMessage } from '@/lib/action-error'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  DAY_MS,
  NOW,
  daysAgo,
  fixtureClerkId,
  seedCities,
  seedFailedSync,
  seedPost,
  seedProject,
  seedRelease,
  seedUser,
  type SeededCities,
} from './__tests__/fixtures.helpers'

/**
 * Project card signals and the project page: latest
 * update is activity (release, post, push); sync status is separate and only
 * the owner learns that a refresh failed; "more from {city}" follows the
 * location policy; the pin cap fails with its specific reason.
 */

const modules = import.meta.glob('./**/*.ts')

type T = TestConvex<typeof schema>

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

async function setSync(
  t: T,
  projectId: Id<'projects'>,
  sync: {
    syncedAt: number | null
    attemptedAt: number | null
    readmePreview?: string | null
  },
) {
  await t.run(async (ctx) => {
    const project = await ctx.db.get(projectId)
    if (!project) throw new Error('missing project')
    await ctx.db.patch(projectId, {
      github: {
        ...project.github,
        lastMetadataSyncedAt: sync.syncedAt,
        lastMetadataSyncAttemptedAt: sync.attemptedAt,
        readmePreview: sync.readmePreview ?? project.github.readmePreview,
      },
    })
  })
}

describe('project signals', () => {
  let t: T
  let cities: SeededCities
  let ownerId: Id<'users'>
  let projectId: Id<'projects'>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    cities = await seedCities(t)
    ownerId = await seedUser(t, {
      username: 'ada',
      cityId: cities.bengaluru,
      buildStatus: 'open_to_collab',
    })
    await seedUser(t, { username: 'grace', cityId: cities.hyderabad })
    projectId = await seedProject(t, {
      ownerId,
      name: 'engine',
      lastCommitAt: daysAgo(5),
    })
    await setSync(t, projectId, {
      syncedAt: daysAgo(1),
      attemptedAt: daysAgo(1),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an explicit public project contract without internal fields', async () => {
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      if (!project) throw new Error('missing project')
      await ctx.db.patch(projectId, {
        locatic: { ...project.locatic, lastPublicActivityAt: NOW },
      })
    })

    const detail = await t.query(api.projects.getPublicByRoute, {
      owner: 'ada',
      repo: 'engine',
    })

    expect(Object.keys(detail?.project ?? {}).sort()).toEqual([
      '_creationTime',
      '_id',
      'github',
      'locatic',
    ])
    expect(Object.keys(detail?.project.github ?? {}).sort()).toEqual([
      'description',
      'fullName',
      'languages',
      'lastCommitAt',
      'primaryLanguage',
      'readmeAssetBaseUrl',
      'readmeAssetRootUrl',
      'readmeLinkBaseUrl',
      'readmeLinkRootUrl',
      'readmePreview',
      'stargazersCount',
      'topics',
    ])
    expect(detail?.project.locatic).toEqual({
      commentsCount: 0,
      postsCount: 0,
      tags: [],
    })
    expect(detail?.project).not.toHaveProperty('exploreOwner')
    expect(detail?.project.locatic).not.toHaveProperty('lastPublicActivityAt')
  })

  it('reports the most recent of release, post and push as the latest update', async () => {
    await seedRelease(t, projectId, daysAgo(3), { tagName: 'v1.2.0' })
    const onlyRelease = await t.query(api.projects.getProjectSignals, {
      projectId,
    })
    expect(onlyRelease?.latestUpdate).toEqual({
      kind: 'release',
      at: daysAgo(3),
      label: 'v1.2.0',
    })

    await seedPost(t, projectId, ownerId, daysAgo(2))
    const withPost = await t.query(api.projects.getProjectSignals, {
      projectId,
    })
    expect(withPost?.latestUpdate).toEqual({ kind: 'post', at: daysAgo(2) })
  })

  it('falls back to the push and ignores drafts and deleted posts', async () => {
    await seedRelease(t, projectId, null, { tagName: 'v9-draft' })
    await seedPost(t, projectId, ownerId, daysAgo(1), { deletedAt: NOW })

    const signals = await t.query(api.projects.getProjectSignals, {
      projectId,
    })

    expect(signals?.latestUpdate).toEqual({ kind: 'repo', at: daysAgo(5) })
  })

  it('discloses the owner location and collaboration status', async () => {
    const signals = await t.query(api.projects.getProjectSignals, {
      projectId,
    })

    expect(signals?.ownerBuildStatus).toBe('open_to_collab')
    expect(signals?.ownerLocation).toEqual({
      kind: 'city',
      cityId: cities.bengaluru,
      cityName: 'Bengaluru, Karnataka, India',
      citySlug: 'bengaluru-in',
      regionLabel: 'Karnataka, India',
    })

    await t.run(async (ctx) => {
      const owner = await ctx.db.get(ownerId)
      if (!owner) throw new Error('missing owner')
      await ctx.db.patch(ownerId, {
        privacy: { ...owner.privacy, cityVisibility: 'region_only' },
      })
    })
    const regionOnly = await t.query(api.projects.getProjectSignals, {
      projectId,
    })
    expect(regionOnly?.ownerLocation).toEqual({
      kind: 'region',
      regionLabel: 'Karnataka, India',
    })
  })

  it.each([
    {
      name: 'fresh',
      sync: { syncedAt: daysAgo(1), attemptedAt: daysAgo(1) },
      expected: { kind: 'fresh', at: daysAgo(1) },
    },
    {
      name: 'stale after a week without a successful sync',
      sync: { syncedAt: daysAgo(8), attemptedAt: daysAgo(8) },
      expected: { kind: 'stale', at: daysAgo(8) },
    },
    {
      name: 'never synced',
      sync: { syncedAt: null, attemptedAt: null },
      expected: { kind: 'never', at: null },
    },
    {
      name: 'fresh when the attempt trails a success by seconds',
      sync: { syncedAt: daysAgo(1), attemptedAt: daysAgo(1) + 30_000 },
      expected: { kind: 'fresh', at: daysAgo(1) },
    },
  ])('reports $name sync status', async ({ sync, expected }) => {
    await setSync(t, projectId, sync)

    const signals = await t.query(api.projects.getProjectSignals, {
      projectId,
    })

    expect(signals?.syncStatus).toEqual({ ...expected, hasReadme: false })
  })

  it('reports a README once one is stored', async () => {
    await setSync(t, projectId, {
      syncedAt: daysAgo(1),
      attemptedAt: daysAgo(1),
      readmePreview: '# engine',
    })

    const signals = await t.query(api.projects.getProjectSignals, {
      projectId,
    })

    expect(signals?.syncStatus.hasReadme).toBe(true)
  })

  it('shows a failed refresh and its reason to the owner only', async () => {
    await seedFailedSync(t, {
      userId: ownerId,
      projectId,
      syncedAt: NOW - DAY_MS / 2,
      error: 'GitHub request failed: 404',
    })

    const ownerView = await as(t, 'ada').query(api.projects.getProjectSignals, {
      projectId,
    })
    expect(ownerView?.syncStatus).toEqual({
      kind: 'failed',
      at: daysAgo(1),
      hasReadme: false,
      error: 'GitHub request failed: 404',
    })

    const visitorView = await as(t, 'grace').query(
      api.projects.getProjectSignals,
      { projectId },
    )
    expect(visitorView?.syncStatus).toEqual({
      kind: 'fresh',
      at: daysAgo(1),
      hasReadme: false,
    })

    const signedOutView = await t.query(api.projects.getProjectSignals, {
      projectId,
    })
    expect(signedOutView?.syncStatus).not.toHaveProperty('error')
    expect(signedOutView?.syncStatus.kind).toBe('fresh')
  })

  it('returns nothing for a hidden project', async () => {
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      if (!project) throw new Error('missing project')
      await ctx.db.patch(projectId, {
        locatic: { ...project.locatic, isVisible: false },
      })
    })

    expect(
      await t.query(api.projects.getProjectSignals, { projectId }),
    ).toBeNull()
  })
})

describe('more from the owner city', () => {
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

  it('lists other discoverable projects from an exact-city owner, newest push first and bounded', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const bob = await seedUser(t, { username: 'bob', cityId: cities.bengaluru })
    const dev = await seedUser(t, {
      username: 'dev',
      cityId: cities.bengaluru,
      cityVisibility: 'region_only',
    })
    const erin = await seedUser(t, {
      username: 'erin',
      cityId: cities.bengaluru,
      cityVisibility: 'hidden',
    })
    const quiet = await seedUser(t, {
      username: 'quiet',
      cityId: cities.bengaluru,
      appearInExplore: false,
    })
    const frank = await seedUser(t, {
      username: 'frank',
      cityId: cities.hyderabad,
    })
    const current = await seedProject(t, {
      ownerId: ada,
      name: 'engine',
      lastCommitAt: daysAgo(0),
    })
    for (let index = 0; index < 7; index += 1) {
      await seedProject(t, {
        ownerId: bob,
        name: `bob-${index}`,
        lastCommitAt: daysAgo(index + 1),
      })
    }
    await seedProject(t, { ownerId: dev, name: 'region-tool' })
    await seedProject(t, { ownerId: erin, name: 'hidden-tool' })
    await seedProject(t, { ownerId: quiet, name: 'quiet-tool' })
    await seedProject(t, { ownerId: frank, name: 'elsewhere' })
    await seedProject(t, { ownerId: ada, name: 'private', isVisible: false })

    const result = await t.query(api.projects.listMoreFromOwnerCity, {
      projectId: current,
    })

    expect(result?.cityId).toBe(cities.bengaluru)
    expect(result?.cityName).toBe('Bengaluru')
    expect(result?.projects.map((project) => project.repo)).toEqual([
      'bob-0',
      'bob-1',
      'bob-2',
      'bob-3',
      'bob-4',
      'bob-5',
    ])
    const preview = result?.projects[0]
    expect(preview?.ownerLocation).toEqual({
      kind: 'city',
      cityId: cities.bengaluru,
      cityName: 'Bengaluru, Karnataka, India',
      citySlug: 'bengaluru-in',
      regionLabel: 'Karnataka, India',
    })
    expect(preview).not.toHaveProperty('email')
    expect(preview).not.toHaveProperty('clerkId')
  })

  it.each(['region_only', 'hidden'] as const)(
    'returns nothing when the owner is %s',
    async (cityVisibility) => {
      const owner = await seedUser(t, {
        username: 'owner',
        cityId: cities.bengaluru,
        cityVisibility,
      })
      const neighbour = await seedUser(t, {
        username: 'neighbour',
        cityId: cities.bengaluru,
      })
      const current = await seedProject(t, { ownerId: owner, name: 'engine' })
      await seedProject(t, { ownerId: neighbour, name: 'tool' })

      expect(
        await t.query(api.projects.listMoreFromOwnerCity, {
          projectId: current,
        }),
      ).toBeNull()
    },
  )
})

describe('pinning', () => {
  let t: T
  let projectIds: Array<Id<'projects'>>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    const ownerId = await seedUser(t, { username: 'ada' })
    projectIds = []
    for (const name of ['one', 'two', 'three', 'four']) {
      projectIds.push(await seedProject(t, { ownerId, name }))
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refuses a fourth pin with the specific reason the undo toast shows', async () => {
    const ada = as(t, 'ada')
    for (const projectId of projectIds.slice(0, 3)) {
      await ada.mutation(api.projects.pinOwnedProject, {
        projectId,
        pinned: true,
      })
    }

    const failure = await ada
      .mutation(api.projects.pinOwnedProject, {
        projectId: projectIds[3]!,
        pinned: true,
      })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(String(failure)).toContain('You can pin at most three projects')
    expect(getActionErrorMessage(failure)).toBe(
      'you can pin up to three projects. unpin one first.',
    )
  })

  it('restores an unpinned project when undo pins it again', async () => {
    const ada = as(t, 'ada')
    await ada.mutation(api.projects.pinOwnedProject, {
      projectId: projectIds[0]!,
      pinned: true,
    })

    expect(
      await ada.mutation(api.projects.pinOwnedProject, {
        projectId: projectIds[0]!,
        pinned: false,
      }),
    ).toEqual([])
    expect(
      await ada.mutation(api.projects.pinOwnedProject, {
        projectId: projectIds[0]!,
        pinned: true,
      }),
    ).toEqual([projectIds[0]])
  })
})
