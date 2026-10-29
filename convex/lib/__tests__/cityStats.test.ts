import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import type { DatabaseWriter } from '../../_generated/server'
import {
  adjustCityStats,
  createCityStatsChanges,
  getBuilderCityId,
  getCityStats,
  getProjectCityId,
  LAST_ACTIVITY_WRITE_STEP_MS,
  recordProjectActivity,
} from '../cityStats'
import { getActivityCellKey } from '../geo'
import type { Doc } from '../types'

type CityVisibility = Doc<'users'>['privacy']['cityVisibility']

const bengaluruId = 'cities_bengaluru' as Id<'cities'>
const berlinId = 'cities_berlin' as Id<'cities'>

function makeBuilder(
  overrides: {
    cityVisibility?: CityVisibility
    appearInExplore?: boolean
    cityId?: Id<'cities'> | null
    deletedAt?: number | null
    deactivatedAt?: number | null
  } = {},
) {
  return {
    appearInExplore: overrides.appearInExplore ?? true,
    deletedAt: overrides.deletedAt ?? null,
    deactivatedAt: overrides.deactivatedAt ?? null,
    profile: {
      cityId: overrides.cityId === undefined ? bengaluruId : overrides.cityId,
    },
    privacy: { cityVisibility: overrides.cityVisibility ?? 'exact_city' },
  } as unknown as Doc<'users'>
}

/**
 * In-memory stand-in for the city rows `adjustCityStats` touches. `query`
 * throws so a test fails if a counter path starts scanning.
 */
function makeCityDb(
  cities: Array<
    Pick<Doc<'cities'>, '_id' | 'stats'> &
      Partial<Pick<Doc<'cities'>, 'location'>>
  >,
) {
  const rows = new Map(
    cities.map((city) => [
      String(city._id),
      { location: { lat: 0, lng: 0 }, ...city } as Partial<Doc<'cities'>>,
    ]),
  )
  const db = {
    get: vi.fn(async (id: Id<'cities'>) => rows.get(String(id)) ?? null),
    patch: vi.fn(async (id: Id<'cities'>, value: Partial<Doc<'cities'>>) => {
      const row = rows.get(String(id))
      if (row) Object.assign(row, value)
    }),
    query: vi.fn(() => {
      throw new Error('counter paths must not query tables')
    }),
  }
  return { db, rows, writer: db as unknown as DatabaseWriter }
}

describe('getBuilderCityId', () => {
  it('counts only discoverable exact-city members', () => {
    expect(getBuilderCityId(makeBuilder())).toBe(bengaluruId)
    expect(
      getBuilderCityId(makeBuilder({ cityVisibility: 'region_only' })),
    ).toBeNull()
    expect(
      getBuilderCityId(makeBuilder({ cityVisibility: 'hidden' })),
    ).toBeNull()
    expect(getBuilderCityId(makeBuilder({ appearInExplore: false }))).toBeNull()
    expect(getBuilderCityId(makeBuilder({ deactivatedAt: 1 }))).toBeNull()
    expect(getBuilderCityId(makeBuilder({ deletedAt: 1 }))).toBeNull()
    expect(getBuilderCityId(makeBuilder({ cityId: null }))).toBeNull()
  })
})

describe('getProjectCityId', () => {
  it('counts a project only when its stored owner fields are eligible', () => {
    const exploreOwner = {
      cityId: bengaluruId,
      appearInExplore: true,
      isActive: true,
      isEligible: true,
    }
    expect(getProjectCityId({ exploreOwner })).toBe(bengaluruId)
    expect(
      getProjectCityId({
        exploreOwner: { ...exploreOwner, isEligible: false },
      }),
    ).toBeNull()
    expect(
      getProjectCityId({ exploreOwner: { ...exploreOwner, cityId: null } }),
    ).toBeNull()
  })
})

describe('getCityStats', () => {
  it('reads one city document and never queries a table', async () => {
    const { db, writer } = makeCityDb([
      {
        _id: bengaluruId,
        stats: { builderCount: 3, projectCount: 4, lastActivityAt: 100 },
      },
      { _id: berlinId, stats: undefined },
    ])

    await expect(getCityStats(writer, bengaluruId)).resolves.toEqual({
      builderCount: 3,
      projectCount: 4,
      lastActivityAt: 100,
    })
    expect(db.get).toHaveBeenCalledTimes(1)
    expect(db.query).not.toHaveBeenCalled()

    await expect(getCityStats(writer, berlinId)).resolves.toEqual({
      builderCount: 0,
      projectCount: 0,
      lastActivityAt: null,
    })
    await expect(
      getCityStats(writer, 'cities_missing' as Id<'cities'>),
    ).resolves.toBeNull()
  })
})

describe('adjustCityStats', () => {
  it('starts missing stats at zero, clamps at zero and only raises activity', async () => {
    const { rows, writer } = makeCityDb([{ _id: berlinId, stats: undefined }])

    await adjustCityStats(writer, berlinId, {
      builders: 1,
      projects: 2,
      activityAt: 50,
    })
    await adjustCityStats(writer, berlinId, { activityAt: 20 })
    expect(rows.get(String(berlinId))?.stats).toEqual({
      builderCount: 1,
      projectCount: 2,
      lastActivityAt: 50,
    })

    await adjustCityStats(writer, berlinId, { builders: -3, projects: -1 })
    expect(rows.get(String(berlinId))?.stats).toEqual({
      builderCount: 0,
      projectCount: 1,
      lastActivityAt: 50,
    })
  })

  it('clears lastActivityAt when no project counts any more and keeps recountedAt', async () => {
    const { rows, writer } = makeCityDb([
      {
        _id: bengaluruId,
        stats: {
          builderCount: 1,
          projectCount: 1,
          lastActivityAt: 90,
          recountedAt: 10,
        },
      },
    ])

    await adjustCityStats(writer, bengaluruId, { projects: -1 })

    expect(rows.get(String(bengaluruId))?.stats).toEqual({
      builderCount: 1,
      projectCount: 0,
      lastActivityAt: null,
      recountedAt: 10,
    })
  })
})

describe('lastActivityAt write step', () => {
  const MINUTE = 60 * 1000
  const eligibleProject = {
    exploreOwner: {
      cityId: bengaluruId,
      appearInExplore: true,
      isActive: true,
      isEligible: true,
    },
  }

  it('writes the city once for two posts five minutes apart, again an hour later', async () => {
    const start = 1_000_000_000
    const { db, rows, writer } = makeCityDb([
      {
        _id: bengaluruId,
        stats: { builderCount: 1, projectCount: 1, lastActivityAt: null },
        activityCell: getActivityCellKey({ lat: 0, lng: 0 }),
      } as Pick<Doc<'cities'>, '_id' | 'stats'>,
    ])

    await recordProjectActivity(writer, eligibleProject, start)
    await recordProjectActivity(writer, eligibleProject, start + 5 * MINUTE)
    expect(db.patch).toHaveBeenCalledTimes(1)
    expect(rows.get(String(bengaluruId))?.stats?.lastActivityAt).toBe(start)

    await recordProjectActivity(
      writer,
      eligibleProject,
      start + LAST_ACTIVITY_WRITE_STEP_MS,
    )
    expect(db.patch).toHaveBeenCalledTimes(2)
    expect(rows.get(String(bengaluruId))?.stats?.lastActivityAt).toBe(
      start + LAST_ACTIVITY_WRITE_STEP_MS,
    )
  })

  it('keeps counters exact and raises activity exactly when counts change', async () => {
    const { rows, writer } = makeCityDb([
      {
        _id: bengaluruId,
        stats: { builderCount: 1, projectCount: 1, lastActivityAt: 1_000 },
      },
    ])

    await adjustCityStats(writer, bengaluruId, {
      projects: 1,
      activityAt: 1_000 + MINUTE,
    })
    expect(rows.get(String(bengaluruId))?.stats).toEqual({
      builderCount: 1,
      projectCount: 2,
      lastActivityAt: 1_000 + MINUTE,
    })
  })
})

describe('activityCell', () => {
  it('holds the city cell while anyone counts and is removed at zero', async () => {
    const location = { lat: 12.9716, lng: 77.5946 }
    const { rows, writer } = makeCityDb([
      { _id: bengaluruId, stats: undefined, location },
    ])

    await adjustCityStats(writer, bengaluruId, { builders: 1 })
    expect(rows.get(String(bengaluruId))?.activityCell).toBe(
      getActivityCellKey(location),
    )

    await adjustCityStats(writer, bengaluruId, { projects: 1 })
    await adjustCityStats(writer, bengaluruId, { builders: -1 })
    expect(rows.get(String(bengaluruId))?.activityCell).toBe(
      getActivityCellKey(location),
    )

    await adjustCityStats(writer, bengaluruId, { projects: -1 })
    expect(rows.get(String(bengaluruId))?.activityCell).toBeUndefined()
  })

  it('writes a missing cell even when the counts do not change', async () => {
    const { db, rows, writer } = makeCityDb([
      {
        _id: bengaluruId,
        stats: { builderCount: 1, projectCount: 0, lastActivityAt: null },
      },
    ])

    await adjustCityStats(writer, bengaluruId, { activityAt: 5 })
    expect(db.patch).toHaveBeenCalledTimes(1)
    expect(rows.get(String(bengaluruId))?.activityCell).toBe(
      getActivityCellKey({ lat: 0, lng: 0 }),
    )
  })
})

describe('createCityStatsChanges', () => {
  it('nets moves per city and writes each affected city once', async () => {
    const { db, rows, writer } = makeCityDb([
      {
        _id: bengaluruId,
        stats: { builderCount: 2, projectCount: 0, lastActivityAt: null },
      },
      { _id: berlinId, stats: undefined },
    ])
    const changes = createCityStatsChanges()

    changes.moveBuilder(bengaluruId, berlinId)
    changes.moveBuilder(berlinId, bengaluruId)
    changes.moveBuilder(bengaluruId, null)
    changes.moveBuilder(null, null)
    await changes.apply(writer)

    expect(rows.get(String(bengaluruId))?.stats?.builderCount).toBe(1)
    // Berlin nets to zero: no read, no write.
    expect(db.get).toHaveBeenCalledTimes(1)
    expect(db.patch).toHaveBeenCalledTimes(1)
    expect(rows.get(String(berlinId))?.stats).toBeUndefined()
  })
})
