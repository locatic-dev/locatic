import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { toPostExcerpt } from './landing'
import { normalizeGithubReadmePreview } from './lib/github'
import {
  NOW,
  daysAgo,
  fixtureClerkId,
  seedCities,
  seedPost,
  seedProject,
  seedRelease,
  seedUser,
  type SeededCities,
} from './__tests__/fixtures.helpers'

/**
 * Landing activity (plan item D7): recent posts, releases and new projects
 * of discoverable owners who disclose an exact city, newest first, a few per
 * builder, each placed on its city.
 */

const modules = import.meta.glob('./**/*.ts')

type T = TestConvex<typeof schema>

describe('landing recent activity (D7)', () => {
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

  async function listActivity() {
    return await t.query(api.landing.listRecentActivity, {})
  }

  /**
   * `count` copies of a seeded project, each its own repo, pushed at
   * `lastCommitAt(index)`: quicker than seeding hundreds one by one.
   */
  async function copyProject(
    projectId: Id<'projects'>,
    count: number,
    lastCommitAt: (index: number) => number,
  ) {
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...row } = (await ctx.db.get(projectId))!
      for (let index = 0; index < count; index++) {
        await ctx.db.insert('projects', {
          ...row,
          github: {
            ...row.github,
            repoId: row.github.repoId + index + 1,
            name: `${row.github.name}-${index}`,
            lastCommitAt: lastCommitAt(index),
          },
        })
      }
    })
  }

  /** Builders in Bengaluru who disclose it, each with one project. */
  async function seedBuilders(prefix: string, count: number) {
    const builders: Array<{ id: Id<'users'>; project: Id<'projects'> }> = []
    for (let index = 0; index < count; index++) {
      const id = await seedUser(t, {
        username: `${prefix}${index}`,
        cityId: cities.bengaluru,
      })
      builders.push({
        id,
        project: await seedProject(t, {
          ownerId: id,
          name: `${prefix}${index}-tool`,
          addedAt: daysAgo(60),
          lastCommitAt: daysAgo(30),
        }),
      })
    }
    return builders
  }

  it('is empty when nothing is public', async () => {
    expect(await listActivity()).toEqual([])
  })

  it('mixes posts, releases, pushes and new projects, newest first, with their targets', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const frank = await seedUser(t, {
      username: 'frank',
      cityId: cities.hyderabad,
    })
    const tool = await seedProject(t, {
      ownerId: ada,
      name: 'tool',
      addedAt: daysAgo(30),
      lastCommitAt: daysAgo(3),
    })
    const api_ = await seedProject(t, {
      ownerId: frank,
      name: 'api',
      addedAt: daysAgo(1),
      lastCommitAt: daysAgo(1),
    })
    const postId = await seedPost(t, tool, ada, daysAgo(0.5), {
      body: 'shipped   dark\nmode',
    })
    const releaseId = await seedRelease(t, api_, daysAgo(2), {
      tagName: 'v1.0.0',
      name: 'First stable',
    })

    const activity = await listActivity()

    expect(activity.map((item) => item.key)).toEqual([
      `post:${postId}`,
      `project:${api_}`,
      `release:${releaseId}`,
      // Pushed since it was shared: shipped, not shared.
      `push:${tool}`,
    ])
    expect(activity[0]).toMatchObject({
      kind: 'post',
      postId,
      excerpt: 'shipped dark mode',
      actor: { handle: 'ada' },
      project: { owner: 'ada', repo: 'tool' },
      city: { slug: expect.any(String), name: 'Bengaluru' },
    })
    expect(activity[2]).toMatchObject({
      kind: 'release',
      releaseId,
      tag: 'v1.0.0',
      name: 'First stable',
      project: { owner: 'frank', repo: 'api' },
      city: { name: 'Hyderabad' },
    })
    expect(activity[3]).toMatchObject({
      kind: 'push',
      at: daysAgo(3),
      project: { owner: 'ada', repo: 'tool' },
      city: { name: 'Bengaluru' },
    })
  })

  it('leaves out private places, hidden work and inactive builders', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const region = await seedUser(t, {
      username: 'region',
      cityId: cities.bengaluru,
      cityVisibility: 'region_only',
    })
    const hidden = await seedUser(t, {
      username: 'hidden',
      cityId: cities.bengaluru,
      cityVisibility: 'hidden',
    })
    const quiet = await seedUser(t, {
      username: 'quiet',
      cityId: cities.bengaluru,
      appearInExplore: false,
    })
    const gone = await seedUser(t, {
      username: 'gone',
      cityId: cities.bengaluru,
    })

    const regionTool = await seedProject(t, { ownerId: region, name: 'r' })
    await seedPost(t, regionTool, region, daysAgo(0.1))
    const hiddenTool = await seedProject(t, { ownerId: hidden, name: 'h' })
    await seedRelease(t, hiddenTool, daysAgo(0.1))
    const quietTool = await seedProject(t, { ownerId: quiet, name: 'q' })
    await seedPost(t, quietTool, quiet, daysAgo(0.1))
    const goneTool = await seedProject(t, { ownerId: gone, name: 'g' })
    await seedPost(t, goneTool, gone, daysAgo(0.1))
    await t.run((ctx) => ctx.db.patch(gone, { deactivatedAt: NOW }))

    const shown = await seedProject(t, { ownerId: ada, name: 'shown' })
    const invisible = await seedProject(t, {
      ownerId: ada,
      name: 'invisible',
      isVisible: false,
    })
    await seedPost(t, invisible, ada, daysAgo(0.1))
    await seedPost(t, shown, ada, daysAgo(0.2), { deletedAt: NOW })
    // A draft release is never shown.
    await seedRelease(t, shown, null, { tagName: 'v9' })

    const activity = await listActivity()

    expect(activity.map((item) => item.key)).toEqual([`push:${shown}`])
    const serialized = JSON.stringify(activity)
    expect(serialized).not.toContain('region')
    expect(serialized).not.toContain('@example.test')
    expect(serialized).not.toContain('clerk_')
  })

  it('caps each builder at two items', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const bob = await seedUser(t, { username: 'bob', cityId: cities.hyderabad })
    const tool = await seedProject(t, { ownerId: ada, name: 'tool' })
    const bobTool = await seedProject(t, { ownerId: bob, name: 'bob-tool' })
    for (const days of [0.1, 0.2, 0.3, 0.4]) {
      await seedPost(t, tool, ada, daysAgo(days))
    }
    await seedPost(t, bobTool, bob, daysAgo(0.5))

    const activity = await listActivity()

    expect(activity.map((item) => item.actor.handle)).toEqual([
      'ada',
      'ada',
      'bob',
      'bob',
    ])
  })

  it('reads past newer rows that never reach the map', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const region = await seedUser(t, {
      username: 'region',
      cityId: cities.bengaluru,
      cityVisibility: 'region_only',
    })
    // More region-only work than any one read window held, all newer.
    for (let index = 0; index < 30; index++) {
      const tool = await seedProject(t, {
        ownerId: region,
        name: `r${index}`,
        addedAt: daysAgo(1),
        lastCommitAt: daysAgo(0.5),
      })
      await seedPost(t, tool, region, daysAgo(0.5))
      await seedRelease(t, tool, daysAgo(0.5))
    }
    const tool = await seedProject(t, {
      ownerId: ada,
      name: 'tool',
      addedAt: daysAgo(10),
      lastCommitAt: daysAgo(20),
    })

    const activity = await listActivity()

    expect(activity.map((item) => item.key)).toEqual([`project:${tool}`])
  })

  it('fills in from other builders when one builder is busy', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const bob = await seedUser(t, { username: 'bob', cityId: cities.hyderabad })
    const tool = await seedProject(t, {
      ownerId: ada,
      name: 'tool',
      addedAt: daysAgo(30),
      lastCommitAt: daysAgo(30),
    })
    const bobTool = await seedProject(t, {
      ownerId: bob,
      name: 'bob-tool',
      addedAt: daysAgo(30),
      lastCommitAt: daysAgo(30),
    })
    for (let index = 0; index < 30; index++) {
      await seedPost(t, tool, ada, daysAgo(0.01 * (index + 1)))
    }
    const bobPost = await seedPost(t, bobTool, bob, daysAgo(1))

    const activity = await listActivity()

    expect(activity.map((item) => item.actor.handle)).toEqual([
      'ada',
      'ada',
      'bob',
      'bob',
    ])
    expect(activity[2]?.key).toBe(`post:${bobPost}`)
  })

  it('shows a project pushed since it was shared as shipped, however many pushed later', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const region = await seedUser(t, {
      username: 'region',
      cityId: cities.bengaluru,
      cityVisibility: 'region_only',
    })
    // Newer pushes than the target's, enough to fill a push window.
    for (let index = 0; index < 20; index++) {
      await seedProject(t, {
        ownerId: region,
        name: `r${index}`,
        addedAt: daysAgo(60),
        lastCommitAt: daysAgo(0.5),
      })
    }
    const tool = await seedProject(t, {
      ownerId: ada,
      name: 'tool',
      addedAt: daysAgo(2),
      lastCommitAt: daysAgo(1),
    })

    const activity = await listActivity()

    expect(activity).toHaveLength(1)
    expect(activity[0]).toMatchObject({
      key: `push:${tool}`,
      kind: 'push',
      at: daysAgo(1),
    })
  })

  it('stops after its scan budget, counting rows a source skips', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const region = await seedUser(t, {
      username: 'region',
      cityId: cities.bengaluru,
      cityVisibility: 'region_only',
    })
    // Pushed since shared, so the shared source reads and skips each one.
    const first = await seedProject(t, {
      ownerId: region,
      name: 'r0',
      addedAt: daysAgo(1),
      lastCommitAt: daysAgo(0.5),
    })
    await copyProject(first, 409, () => daysAgo(0.5))
    // Only past every one of them.
    await seedProject(t, {
      ownerId: ada,
      name: 'tool',
      addedAt: daysAgo(10),
      lastCommitAt: daysAgo(20),
    })

    expect(await listActivity()).toEqual([])
  })

  it('stays under the transaction read limit when rows carry large READMEs', async () => {
    const limited = convexTest({ schema, modules, transactionLimits: true })
    t = limited
    cities = await seedCities(t)
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    const region = await seedUser(t, {
      username: 'region',
      cityId: cities.bengaluru,
      cityVisibility: 'region_only',
    })
    // A 20,000-character CJK preview: about 60 KB of UTF-8 per row, so 396
    // region-only rows read from both project indexes pass 16 MiB.
    const readmePreview = normalizeGithubReadmePreview('界'.repeat(20000))
    const first = await seedProject(t, {
      ownerId: region,
      name: 'r0',
      addedAt: daysAgo(1),
      lastCommitAt: daysAgo(0.5),
    })
    await t.run(async (ctx) => {
      const row = (await ctx.db.get(first))!
      await ctx.db.patch(first, { github: { ...row.github, readmePreview } })
    })
    // Batches keep each setup write under the limit too.
    for (let batch = 0; batch < 5; batch++) {
      await t.run(async (ctx) => {
        const { _id, _creationTime, ...row } = (await ctx.db.get(first))!
        for (let index = 0; index < (batch < 4 ? 80 : 75); index++) {
          const copy = batch * 80 + index + 1
          await ctx.db.insert('projects', {
            ...row,
            github: {
              ...row.github,
              repoId: row.github.repoId + copy,
              name: `${row.github.name}-${copy}`,
            },
          })
        }
      })
    }
    // Newer than all of them, so the scan meets it before the byte budget.
    const tool = await seedProject(t, {
      ownerId: ada,
      name: 'tool',
      addedAt: daysAgo(0.1),
      lastCommitAt: daysAgo(0.2),
    })

    const activity = await listActivity()

    expect(activity.map((item) => item.key)).toEqual([`project:${tool}`])
  })

  it('fills the globe from one source while another has nothing to show', async () => {
    const builders = await seedBuilders('b', 6)
    // 410 shipped projects: the shared source reads only rows it skips.
    for (const [index, { project }] of builders.entries()) {
      await copyProject(project, 68, (copy) =>
        daysAgo(0.001 * (copy * builders.length + index + 1)),
      )
    }

    const activity = await listActivity()

    expect(activity).toHaveLength(12)
    expect(activity.every((item) => item.kind === 'push')).toBe(true)
    expect(new Set(activity.map((item) => item.actor.handle)).size).toBe(6)
  })

  it('keeps newer posts when the project sources are all of one kind', async () => {
    const posters = await seedBuilders('p', 12)
    for (const [index, { id, project }] of posters.entries()) {
      await seedPost(t, project, id, daysAgo(0.0001 * (index + 1)))
    }
    const [shipper] = await seedBuilders('s', 1)
    await copyProject(shipper!.project, 410, (copy) =>
      daysAgo(0.01 * (copy + 1)),
    )

    const activity = await listActivity()

    expect(activity).toHaveLength(12)
    expect(activity.every((item) => item.kind === 'post')).toBe(true)
  })

  it('is the same for visitors and members', async () => {
    const ada = await seedUser(t, { username: 'ada', cityId: cities.bengaluru })
    await seedProject(t, { ownerId: ada, name: 'tool' })

    const member = await t
      .withIdentity({ subject: fixtureClerkId('ada') })
      .query(api.landing.listRecentActivity, {})

    expect(member).toEqual(await listActivity())
  })
})

describe('toPostExcerpt', () => {
  it('collapses whitespace and cuts long bodies at a word', () => {
    expect(toPostExcerpt('  one\n\ntwo  ')).toBe('one two')
    const long = `${'word '.repeat(30)}end`
    const excerpt = toPostExcerpt(long)
    expect(excerpt.endsWith('word…')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(91)
  })
})
