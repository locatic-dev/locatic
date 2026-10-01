import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  BENGALURU,
  NOW,
  daysAgo,
  fixtureClerkId,
  seedCity,
  seedFollow,
  seedPost,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')

const OVERVIEW_KEYS = [
  'githubContributions',
  'githubUsername',
  'pinnedProjects',
  'privacy',
  'profile',
  'recentPosts',
  'recentProjects',
  'stats',
  'userId',
]
const PROFILE_KEYS = [
  'avatarUrl',
  'bio',
  'buildStatus',
  'city',
  'displayName',
  'location',
  'socialLinks',
]
const PRIVACY_KEYS = [
  'commentHistoryVisibility',
  'contributionsVisibility',
  'followGraphVisibility',
  'likedProjectsVisibility',
]
const STATS_KEYS = [
  'commentsCount',
  'contributionsCount',
  'followersCount',
  'followingCount',
  'likedCount',
  'postsCount',
  'projectsCount',
]

function sortedKeys(value: object | null | undefined) {
  return Object.keys(value ?? {}).sort()
}

async function overview(
  t: TestConvex<typeof schema>,
  username: string,
  requester?: string,
) {
  const client = requester
    ? t.withIdentity({ subject: fixtureClerkId(requester) })
    : t
  return await client.query(api.users.publicProfileOverview, { username })
}

describe('users.viewerBootstrap', () => {
  it('omits internal activity ranking fields from the viewer contract', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedUser(t, { username: 'ada' })

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId)
      if (!user) throw new Error('missing fixture user')
      await ctx.db.patch(userId, {
        stats: { ...user.stats, lastPublicActivityAt: NOW },
      })
    })

    const bootstrap = await t
      .withIdentity({ subject: fixtureClerkId('ada') })
      .query(api.users.viewerBootstrap, {})

    expect(bootstrap.status).toBe('ready')
    expect(sortedKeys(bootstrap.viewer?.stats)).toEqual(STATS_KEYS)
    expect(bootstrap.viewer?.stats).not.toHaveProperty('lastPublicActivityAt')
  })
})

describe('users.publicProfileOverview (C6 profile payload)', () => {
  let t: TestConvex<typeof schema>
  let bengaluru: Id<'cities'>
  let ada: Id<'users'>
  let bob: Id<'users'>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    bengaluru = await seedCity(t, BENGALURU)
    ada = await seedUser(t, {
      username: 'ada',
      displayName: 'Ada',
      bio: 'maps and compilers',
      cityId: bengaluru,
      buildStatus: 'open_to_collab',
      withContributions: true,
    })
    bob = await seedUser(t, { username: 'bob', cityId: bengaluru })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the reviewed field set to a visitor, with no viewer-relative fields', async () => {
    const result = await overview(t, 'ada')

    expect(sortedKeys(result)).toEqual(OVERVIEW_KEYS)
    expect(sortedKeys(result?.profile)).toEqual(PROFILE_KEYS)
    expect(sortedKeys(result?.privacy)).toEqual(PRIVACY_KEYS)
    expect(sortedKeys(result?.stats)).toEqual(STATS_KEYS)
    expect(result).toMatchObject({
      userId: ada,
      githubUsername: 'ada',
      profile: {
        displayName: 'Ada',
        bio: 'maps and compilers',
        buildStatus: 'open_to_collab',
        location: {
          kind: 'city',
          cityId: bengaluru,
          cityName: 'Bengaluru, Karnataka, India',
          regionLabel: 'Karnataka, India',
        },
        city: 'Bengaluru, Karnataka, India',
      },
    })
  })

  it('adds only viewerFollowsProfile for a signed-in requester', async () => {
    await seedFollow(t, bob, ada)

    const followed = await overview(t, 'ada', 'bob')
    const notFollowed = await overview(t, 'bob', 'ada')

    expect(sortedKeys(followed)).toEqual(
      [...OVERVIEW_KEYS, 'viewerFollowsProfile'].sort(),
    )
    expect(followed?.viewerFollowsProfile).toBe(true)
    expect(notFollowed?.viewerFollowsProfile).toBe(false)
  })

  it('never serialises contact details, auth ids or private settings', async () => {
    for (const requester of [undefined, 'bob']) {
      const serialized = JSON.stringify(await overview(t, 'ada', requester))

      for (const secret of [
        'ada@example.test',
        fixtureClerkId('ada'),
        'email',
        'clerkId',
        'cityVisibility',
        'appearInPulse',
        'profileVisibility',
        'notificationPrefs',
        'unreadMessagesCount',
        'exploreConfig',
      ]) {
        expect(serialized).not.toContain(secret)
      }
    }
  })

  it('discloses a region-only builder by region label with no city id', async () => {
    await seedUser(t, {
      username: 'reggie',
      cityId: bengaluru,
      cityVisibility: 'region_only',
    })

    const result = await overview(t, 'reggie')

    expect(result?.profile.location).toEqual({
      kind: 'region',
      regionLabel: 'Karnataka, India',
    })
    expect(result?.profile.city).toBe('Karnataka, India')
    expect(JSON.stringify(result)).not.toContain(String(bengaluru))
  })

  it('discloses nothing for a hidden-city builder', async () => {
    await seedUser(t, {
      username: 'hana',
      cityId: bengaluru,
      cityVisibility: 'hidden',
    })

    const result = await overview(t, 'hana')

    expect(result?.profile.location).toEqual({ kind: 'none' })
    expect(result?.profile.city).toBeNull()
    expect(JSON.stringify(result)).not.toContain(String(bengaluru))
  })

  it('returns pins in pin order and the latest five other visible projects', async () => {
    const projects: Array<Id<'projects'>> = []
    for (let index = 1; index <= 7; index += 1) {
      projects.push(
        await seedProject(t, { ownerId: ada, name: `project-${index}` }),
      )
    }
    const hidden = await seedProject(t, {
      ownerId: ada,
      name: 'hidden-project',
      isVisible: false,
    })
    const [p1, p2, p3, p4, p5, p6, p7] = projects
    // A stale pin on a hidden project must not leak it.
    await t.run((ctx) =>
      ctx.db.patch(ada, { pinnedProfileProjectIds: [p2, hidden, p1] }),
    )

    const result = await overview(t, 'ada')

    expect(result?.pinnedProjects.map((project) => project.projectId)).toEqual([
      p2,
      p1,
    ])
    expect(result?.recentProjects.map((project) => project.projectId)).toEqual([
      p7,
      p6,
      p5,
      p4,
      p3,
    ])
    for (const project of [
      ...(result?.pinnedProjects ?? []),
      ...(result?.recentProjects ?? []),
    ]) {
      expect(project.authorHandle).toBe('ada')
      expect(project.cityLabel).toBe('Bengaluru, Karnataka, India')
    }
  })

  it('returns at most five recent posts, newest first, skipping deleted and hidden-project posts', async () => {
    const visible = await seedProject(t, { ownerId: ada, name: 'visible' })
    const hidden = await seedProject(t, {
      ownerId: ada,
      name: 'hidden',
      isVisible: false,
    })
    const posts: Array<Id<'posts'>> = []
    for (let day = 7; day >= 1; day -= 1) {
      posts.push(await seedPost(t, visible, ada, daysAgo(day)))
    }
    await seedPost(t, visible, ada, daysAgo(0.25), { deletedAt: NOW })

    const newestFive = [...posts].reverse().slice(0, 5)
    expect(
      (await overview(t, 'ada'))?.recentPosts.map((post) => post._id),
    ).toEqual(newestFive)

    // The read is bounded to five rows before visibility filtering, so a
    // newer post on a hidden project leaves four, never a sixth older one.
    await seedPost(t, hidden, ada, daysAgo(0.5))
    expect(
      (await overview(t, 'ada'))?.recentPosts.map((post) => post._id),
    ).toEqual(newestFive.slice(0, 4))
  })

  it('withholds counts behind private tabs', async () => {
    await t.run(async (ctx) => {
      const user = await ctx.db.get(ada)
      if (!user) throw new Error('missing fixture user')
      await ctx.db.patch(ada, {
        stats: {
          ...user.stats,
          commentsCount: 4,
          likedCount: 5,
          contributionsCount: 6,
        },
        privacy: {
          ...user.privacy,
          commentHistoryVisibility: 'private',
          likedProjectsVisibility: 'private',
          contributionsVisibility: 'private',
        },
      })
    })

    const result = await overview(t, 'ada')

    expect(result?.stats).toMatchObject({
      commentsCount: null,
      likedCount: null,
      contributionsCount: null,
    })
    expect(result?.privacy).toEqual({
      followGraphVisibility: 'public',
      commentHistoryVisibility: 'private',
      likedProjectsVisibility: 'private',
      contributionsVisibility: 'private',
    })
  })

  it('returns null for a missing or deactivated user', async () => {
    await t.run((ctx) => ctx.db.patch(bob, { deactivatedAt: NOW }))

    expect(await overview(t, 'nobody')).toBeNull()
    expect(await overview(t, 'bob')).toBeNull()
  })

  it('adds card signals to project previews and shows a failed sync to its owner only', async () => {
    const projectId = await seedProject(t, { ownerId: ada, name: 'mapkit' })
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      if (!project) throw new Error('project missing')
      await ctx.db.patch(projectId, {
        github: {
          ...project.github,
          lastMetadataSyncedAt: daysAgo(3),
          lastMetadataSyncAttemptedAt: NOW,
        },
      })
      await ctx.db.insert('github_sync_log', {
        userId: ada,
        syncType: 'metadata',
        reposFetched: 0,
        reposNew: 0,
        reposUpdated: 0,
        status: 'failed',
        error: 'GitHub returned 502',
        githubRateLimitRemaining: null,
        syncedAt: NOW,
      })
    })

    const [visitor, other, owner] = await Promise.all([
      overview(t, 'ada'),
      overview(t, 'ada', 'bob'),
      overview(t, 'ada', 'ada'),
    ])
    const [visitorCard] = visitor?.recentProjects ?? []
    const [otherCard] = other?.recentProjects ?? []
    const [ownerCard] = owner?.recentProjects ?? []

    expect(visitorCard).toMatchObject({
      ownerLocation: { kind: 'city', cityId: bengaluru },
      ownerBuildStatus: 'open_to_collab',
      latestUpdate: { kind: 'repo' },
      syncStatus: { kind: 'fresh', at: daysAgo(3) },
    })
    for (const card of [visitorCard, otherCard]) {
      expect(card.syncStatus?.kind).not.toBe('failed')
      expect(card.syncStatus).not.toHaveProperty('error')
      expect(JSON.stringify(card)).not.toContain('GitHub returned 502')
    }
    expect(ownerCard.syncStatus).toEqual({
      kind: 'failed',
      at: daysAgo(3),
      hasReadme: false,
      error: 'GitHub returned 502',
    })
  })
})
