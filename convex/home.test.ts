import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { HOME_FEED_RETENTION_MS, getHomeFeedCutoff } from './lib/homeFeed'
import {
  BENGALURU,
  DAY_MS,
  NOW,
  daysAgo,
  fixtureClerkId,
  seedActivityEvent,
  seedFollow,
  seedCity,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'

/**
 * Home activity path (plan item C5, decision D12). These fixtures prove how
 * delivery, reads and retention behave on one injected clock. They do not
 * reproduce, and cannot establish, the cause of the historical empty-feed
 * incident: its production data expired with the 30-day purge.
 */

const modules = import.meta.glob('./**/*.ts')
const PAGE = { numItems: 50, cursor: null }

type T = TestConvex<typeof schema>

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

async function listHome(t: T, username: string) {
  const result = await as(t, username).query(api.home.list, {
    paginationOpts: PAGE,
  })
  return result.page
}

async function feedRows(t: T, userId: Id<'users'>) {
  return await t.run((ctx) =>
    ctx.db
      .query('home_feed_items')
      .withIndex('by_user_created', (query) => query.eq('userId', userId))
      .collect(),
  )
}

/**
 * `follows.follow` schedules the follower's own `followed` event fan-out with
 * `runAfter(0)`. Timers are real here (only `Date` is faked), so yield a
 * macrotask and then wait for whatever started.
 */
async function drainScheduled(t: T) {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await t.finishInProgressScheduledFunctions()
  }
}

async function follow(t: T, follower: string, targetUserId: Id<'users'>) {
  await as(t, follower).mutation(api.follows.follow, { targetUserId })
  await drainScheduled(t)
}

async function unfollow(t: T, follower: string, targetUserId: Id<'users'>) {
  await as(t, follower).mutation(api.follows.unfollow, { targetUserId })
}

describe('home activity path and retention (C5)', () => {
  let t: T
  let viewerId: Id<'users'>
  let builderId: Id<'users'>
  let projectId: Id<'projects'>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    viewerId = await seedUser(t, { username: 'viewer' })
    builderId = await seedUser(t, { username: 'builder' })
    projectId = await seedProject(t, { ownerId: builderId, name: 'mapkit' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('traces a followed event from source to the Home page', async () => {
    const eventId = await seedActivityEvent(
      t,
      builderId,
      projectId,
      daysAgo(2),
      'project_posted',
    )

    await follow(t, 'viewer', builderId)

    // 1. Source: the event exists (else: missing source event).
    const source = await t.run((ctx) => ctx.db.get(eventId))
    expect(source).not.toBeNull()

    // 2. Delivery: the follower has one persisted row for it (else: failed
    //    delivery).
    const rows = await feedRows(t, viewerId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorId: builderId,
      sourceEventIds: [eventId],
      eventType: 'project_posted',
    })

    // 3. Retention: the row is inside the boundary (else: expired activity).
    expect(rows[0].createdAt).toBeGreaterThanOrEqual(getHomeFeedCutoff(NOW))

    // 4. Read: `home.list` returns it with a renderable, openable target
    //    (else: incorrect rendering; the card render is covered in
    //    src/features/home/__tests__/home-feed-card.test.tsx).
    const page = await listHome(t, 'viewer')
    expect(page).toHaveLength(1)
    expect(page[0]).toMatchObject({
      _id: rows[0]._id,
      actorSnapshot: { displayName: 'builder' },
      target: { kind: 'project', projectId, isOpenable: true },
    })
    expect(page[0].previewTargets).toHaveLength(1)
  })

  it('does not backfill an event older than the 30-day boundary', async () => {
    await seedActivityEvent(
      t,
      builderId,
      projectId,
      daysAgo(40),
      'project_posted',
    )

    await follow(t, 'viewer', builderId)

    expect(await feedRows(t, viewerId)).toEqual([])
    expect(await listHome(t, 'viewer')).toEqual([])
  })

  it('backfills only the recent events when old and new ones coexist', async () => {
    const recent = await seedActivityEvent(
      t,
      builderId,
      projectId,
      daysAgo(2),
      'project_posted',
    )
    await seedActivityEvent(
      t,
      builderId,
      projectId,
      daysAgo(45),
      'project_liked',
    )

    await follow(t, 'viewer', builderId)

    const page = await listHome(t, 'viewer')
    expect(page.map((item) => item.sourceEventIds)).toEqual([[recent]])
  })

  it('agrees on the exact boundary: backfilled, listed and kept by cleanup', async () => {
    await seedActivityEvent(
      t,
      builderId,
      projectId,
      NOW - HOME_FEED_RETENTION_MS,
      'project_posted',
    )

    await follow(t, 'viewer', builderId)
    expect(await listHome(t, 'viewer')).toHaveLength(1)

    await t.mutation(internal.cleanup.runDailyCleanup, {})
    expect(await feedRows(t, viewerId)).toHaveLength(1)
    expect(await listHome(t, 'viewer')).toHaveLength(1)
  })

  it('drops an item that crosses the boundary from reads and cleanup on the same clock', async () => {
    const eventId = await seedActivityEvent(
      t,
      builderId,
      projectId,
      daysAgo(29),
      'project_posted',
    )
    await follow(t, 'viewer', builderId)
    expect(await listHome(t, 'viewer')).toHaveLength(1)

    // Two days later the item is 31 days old.
    vi.setSystemTime(NOW + 2 * DAY_MS)

    // Read before cleanup: already outside the window.
    expect(await feedRows(t, viewerId)).toHaveLength(1)
    expect(await listHome(t, 'viewer')).toEqual([])

    // Cleanup on the same clock deletes the row; the source event (90-day
    // retention) survives.
    const result = await t.mutation(internal.cleanup.runDailyCleanup, {})
    expect(result.deletedFeedItems).toBe(1)
    expect(await feedRows(t, viewerId)).toEqual([])
    expect(await listHome(t, 'viewer')).toEqual([])
    expect(await t.run((ctx) => ctx.db.get(eventId))).not.toBeNull()
  })

  it('delivers a new event to an existing follower through fan-out', async () => {
    await seedFollow(t, viewerId, builderId)
    const eventId = await seedActivityEvent(
      t,
      builderId,
      projectId,
      NOW,
      'project_posted',
    )

    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId,
      cursor: null,
    })

    const page = await listHome(t, 'viewer')
    expect(page).toHaveLength(1)
    expect(page[0]).toMatchObject({ sourceEventIds: [eventId], priority: 1 })
  })

  it('removes the follower items on unfollow', async () => {
    await seedActivityEvent(
      t,
      builderId,
      projectId,
      daysAgo(2),
      'project_posted',
    )
    const otherId = await seedUser(t, { username: 'other' })
    const otherProject = await seedProject(t, {
      ownerId: otherId,
      name: 'kiln',
    })
    await seedActivityEvent(
      t,
      otherId,
      otherProject,
      daysAgo(3),
      'project_posted',
    )

    await follow(t, 'viewer', builderId)
    await follow(t, 'viewer', otherId)
    expect(await listHome(t, 'viewer')).toHaveLength(2)

    await unfollow(t, 'viewer', builderId)

    const page = await listHome(t, 'viewer')
    expect(page.map((item) => item.actorId)).toEqual([otherId])
  })

  it('does not duplicate on re-follow or a retried fan-out', async () => {
    const eventId = await seedActivityEvent(
      t,
      builderId,
      projectId,
      daysAgo(1),
      'project_posted',
    )

    await follow(t, 'viewer', builderId)
    await unfollow(t, 'viewer', builderId)
    await follow(t, 'viewer', builderId)

    // A retried fan-out of an already-delivered event is a no-op.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await t.mutation(internal.home.fanOutActivityEventBatch, {
        eventId,
        cursor: null,
      })
    }

    const rows = await feedRows(t, viewerId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ eventCount: 1, sourceEventIds: [eventId] })
    expect(await listHome(t, 'viewer')).toHaveLength(1)
  })

  it('delivers nothing for a missing source event', async () => {
    await seedFollow(t, viewerId, builderId)
    const eventId = await seedActivityEvent(
      t,
      builderId,
      projectId,
      NOW,
      'project_posted',
    )
    await t.run((ctx) => ctx.db.delete(eventId))

    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId,
      cursor: null,
    })

    expect(await feedRows(t, viewerId)).toEqual([])
    expect(await listHome(t, 'viewer')).toEqual([])
  })

  it('delivers nothing for a source event without a renderable target', async () => {
    await seedFollow(t, viewerId, builderId)
    const eventId = await seedActivityEvent(
      t,
      builderId,
      projectId,
      NOW,
      'project_posted',
    )
    // A legacy row with neither `target` nor a project snapshot.
    await t.run((ctx) =>
      ctx.db.patch(eventId, { target: undefined, projectSnapshot: null }),
    )

    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId,
      cursor: null,
    })

    expect(await listHome(t, 'viewer')).toEqual([])
  })

  it('reads the actor live: current login, current location disclosure', async () => {
    const bengaluru = await seedCity(t, BENGALURU)
    await t.run(async (ctx) => {
      const builder = await ctx.db.get(builderId)
      if (!builder) throw new Error('builder missing')
      await ctx.db.patch(builderId, {
        profile: { ...builder.profile, cityId: bengaluru },
      })
    })
    await seedFollow(t, viewerId, builderId)
    // Two rows from one actor: the actor is read once per page.
    for (const at of [daysAgo(2), daysAgo(1)]) {
      const eventId = await seedActivityEvent(
        t,
        builderId,
        projectId,
        at,
        'project_posted',
      )
      await t.mutation(internal.home.fanOutActivityEventBatch, {
        eventId,
        cursor: null,
      })
    }

    const stored = await listHome(t, 'viewer')
    expect(stored).toHaveLength(2)
    for (const row of stored) {
      expect(row.actorGithubUsername).toBe('builder')
      expect(row.actorSnapshot).toMatchObject({
        cityId: bengaluru,
        cityName: 'Bengaluru, Karnataka, India',
      })
    }

    // The builder later hides their city: stored rows stop disclosing it.
    await t.run(async (ctx) => {
      const builder = await ctx.db.get(builderId)
      if (!builder) throw new Error('builder missing')
      await ctx.db.patch(builderId, {
        privacy: { ...builder.privacy, cityVisibility: 'hidden' },
      })
    })
    for (const row of await listHome(t, 'viewer')) {
      expect(row.actorSnapshot).toMatchObject({ cityId: null, cityName: null })
      expect(JSON.stringify(row.actorSnapshot)).not.toContain(String(bengaluru))
    }

    // A deactivated actor keeps the row but loses the profile link.
    await t.run((ctx) => ctx.db.patch(builderId, { deactivatedAt: NOW }))
    for (const row of await listHome(t, 'viewer')) {
      expect(row.actorGithubUsername).toBeNull()
    }
  })

  it('removes a project owner location from stored snapshots after privacy changes', async () => {
    const bengaluru = await seedCity(t, BENGALURU)
    const privateBuilder = await seedUser(t, {
      username: 'private-builder',
      cityId: bengaluru,
    })
    const privateProject = await seedProject(t, {
      ownerId: privateBuilder,
      name: 'private-map',
    })
    await seedFollow(t, viewerId, privateBuilder)
    const eventId = await seedActivityEvent(
      t,
      privateBuilder,
      privateProject,
      NOW,
      'project_posted',
    )
    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId,
      cursor: null,
    })

    const initial = await listHome(t, 'viewer')
    expect(initial[0]?.projectSnapshot).toMatchObject({
      cityId: bengaluru,
      cityName: 'Bengaluru, Karnataka, India',
    })

    await as(t, 'private-builder').mutation(api.users.updatePrivacy, {
      cityVisibility: 'hidden',
    })
    await as(t, 'private-builder').mutation(api.projects.updateVisibility, {
      projectId: privateProject,
      isVisible: false,
    })

    const hidden = await listHome(t, 'viewer')
    expect(hidden[0]?.projectSnapshot).toMatchObject({
      cityId: null,
      cityName: null,
    })
    expect(hidden[0]?.target).toMatchObject({
      projectSnapshot: { cityId: null, cityName: null },
      isOpenable: false,
    })
    expect(JSON.stringify(hidden[0])).not.toContain(String(bengaluru))

    // Deleting the project does not make the stored snapshot trusted again.
    await t.run((ctx) => ctx.db.delete(privateProject))
    const deleted = await listHome(t, 'viewer')
    expect(deleted[0]?.projectSnapshot).toMatchObject({
      cityId: null,
      cityName: null,
    })
    expect(JSON.stringify(deleted[0])).not.toContain(String(bengaluru))
  })
})

describe('profile targets and follow backfill (S1, S6)', () => {
  let t: T
  let viewerId: Id<'users'>
  let builderId: Id<'users'>
  let projectId: Id<'projects'>
  let bengaluru: Id<'cities'>

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    bengaluru = await seedCity(t, BENGALURU)
    viewerId = await seedUser(t, { username: 'viewer' })
    builderId = await seedUser(t, { username: 'builder' })
    projectId = await seedProject(t, { ownerId: builderId, name: 'mapkit' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serves a followed profile target with the live location, never the stored city', async () => {
    const patId = await seedUser(t, { username: 'pat', cityId: bengaluru })
    await seedFollow(t, viewerId, builderId)
    // builder follows pat: a `followed` event with a profile target, stored
    // while pat discloses the exact city, delivered to the viewer.
    await follow(t, 'builder', patId)

    const profileTarget = async () => {
      const [row] = await listHome(t, 'viewer')
      expect(row?.target?.kind).toBe('profile')
      return row.target?.kind === 'profile' ? row.target : null
    }
    expect((await profileTarget())?.profile).toMatchObject({
      userId: patId,
      cityId: bengaluru,
      cityName: 'Bengaluru, Karnataka, India',
    })

    await as(t, 'pat').mutation(api.users.updatePrivacy, {
      cityVisibility: 'hidden',
    })
    expect((await profileTarget())?.profile).toMatchObject({
      cityId: null,
      cityName: null,
    })

    await as(t, 'pat').mutation(api.users.updatePrivacy, {
      cityVisibility: 'region_only',
    })
    expect((await profileTarget())?.profile).toMatchObject({
      cityId: null,
      cityName: 'Karnataka, India',
    })

    // A user who left: the stored snapshot is served without any location.
    await t.run((ctx) => ctx.db.patch(patId, { deactivatedAt: NOW }))
    const gone = await profileTarget()
    expect(gone?.isOpenable).toBe(false)
    expect(gone?.profile).toMatchObject({ cityId: null, cityName: null })
  })

  it('backfills two same-group events into one row without duplicates', async () => {
    // Two posts on the same project the same UTC day group into one row.
    const first = await seedActivityEvent(
      t,
      builderId,
      projectId,
      NOW - 2 * 60 * 60 * 1000,
      'project_posted',
    )
    const second = await seedActivityEvent(
      t,
      builderId,
      projectId,
      NOW - 60 * 60 * 1000,
      'project_posted',
    )

    await follow(t, 'viewer', builderId)

    const rows = await feedRows(t, viewerId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      eventCount: 2,
      sourceEventIds: [first, second],
      sourceEventId: second,
    })
    // The group read that later writes depend on still resolves.
    const page = await listHome(t, 'viewer')
    expect(page).toHaveLength(1)
    const third = await seedActivityEvent(
      t,
      builderId,
      projectId,
      NOW - 30 * 60 * 1000,
      'project_posted',
    )
    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId: third,
      cursor: null,
    })
    expect(await feedRows(t, viewerId)).toHaveLength(1)
  })
})
