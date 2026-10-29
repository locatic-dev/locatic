import type { Id } from '../_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import {
  getActivityCellKey,
  getGreatCircleDistanceKm,
  getNeighbouringCellKeys,
} from './geo'
import type { Doc } from './types'
import { getMemberCityId } from './visibility'

/**
 * City counters. `cities.stats` is maintained
 * on write by the mutations that change who or what counts for a city, so
 * read paths never aggregate:
 *
 * - `builderCount`: users who are exact-city members of the city (the
 *   visibility policy) and discoverable (`appearInExplore`, not deactivated,
 *   not deleted). Region-only and hidden users never count.
 * - `projectCount`: projects with `exploreOwner.isEligible` whose
 *   `exploreOwner.cityId` is the city, i.e. visible projects of counted
 *   builders. Both fields are derived from the owner by
 *   `buildProjectExploreOwner`.
 * - `lastActivityAt`: latest `lastCommitAt`, live post `createdAt` or release
 *   `publishedAt` among counted projects. Maintained as a high-water mark:
 *   raised when a project joins the city or records new activity, reset to
 *   null when the city has no counted projects, and made exact again by
 *   `internal.cities.recountStats`. It is never lowered on write, because
 *   finding the next-latest project would need a scan. New activity alone
 *   raises it only in steps of at least `LAST_ACTIVITY_WRITE_STEP_MS` (one
 *   hour), so it can trail the latest activity by up to an hour: every
 *   project card reads its owner's city document, and a write per post, push
 *   or release would re-run every subscribed query showing a card from that
 *   city.
 *
 * Missing `stats` (rows written before the counters, or cities nobody has counted for)
 * read as zero.
 *
 * `activityCell` is written with the counters: the city's
 * coarse cell while `builderCount` or `projectCount` is above zero, removed
 * otherwise. `readNearbyActiveCities` reads it by index.
 */

type Reader = DatabaseReader | DatabaseWriter

export type CityStats = {
  builderCount: number
  projectCount: number
  lastActivityAt: number | null
}

export const EMPTY_CITY_STATS: CityStats = {
  builderCount: 0,
  projectCount: 0,
  lastActivityAt: null,
}

type BuilderCandidate = Pick<
  Doc<'users'>,
  'profile' | 'privacy' | 'appearInExplore' | 'deletedAt' | 'deactivatedAt'
>

type ProjectCandidate = Pick<Doc<'projects'>, 'exploreOwner'>

export function readCityStats(
  city: Pick<Doc<'cities'>, 'stats'> | null,
): CityStats {
  const stats = city?.stats
  if (!stats) {
    return { ...EMPTY_CITY_STATS }
  }
  return {
    builderCount: stats.builderCount,
    projectCount: stats.projectCount,
    lastActivityAt: stats.lastActivityAt,
  }
}

/**
 * A city is active for nearby lookups while it has a counted builder or
 * project. Counts come from `cities.stats`, so hidden and region-only users never make a
 * city active.
 */
export function hasCityActivity(
  stats: Pick<CityStats, 'builderCount' | 'projectCount'>,
): boolean {
  return stats.builderCount > 0 || stats.projectCount > 0
}

/** The `activityCell` a city holds for the given stats: its cell, or none. */
export function getCityActivityCell(
  city: Pick<Doc<'cities'>, 'location'>,
  stats: Pick<CityStats, 'builderCount' | 'projectCount'>,
): string | undefined {
  return hasCityActivity(stats) ? getActivityCellKey(city.location) : undefined
}

/** The city a user counts toward as a builder, or null. */
export function getBuilderCityId(user: BuilderCandidate): Id<'cities'> | null {
  if (
    !user.appearInExplore ||
    user.deletedAt != null ||
    user.deactivatedAt != null
  ) {
    return null
  }
  return getMemberCityId(user)
}

/** The city a project counts toward, from its stored `exploreOwner`. */
export function getProjectCityId(
  project: ProjectCandidate,
): Id<'cities'> | null {
  return project.exploreOwner.isEligible ? project.exploreOwner.cityId : null
}

/**
 * Latest public activity on a project: commit, live post or published release.
 * Future upstream timestamps are clamped so they cannot pin activity ranking.
 */
export async function getProjectActivityAt(
  db: Reader,
  project: Pick<Doc<'projects'>, '_id' | 'github'>,
): Promise<number> {
  const [latestPost, latestRelease] = await Promise.all([
    db
      .query('posts')
      .withIndex('by_project_deleted_created', (query) =>
        query.eq('projectId', project._id).eq('deletedAt', null),
      )
      .order('desc')
      .first(),
    db
      .query('project_releases')
      .withIndex('by_project_published', (query) =>
        query.eq('projectId', project._id),
      )
      .order('desc')
      .first(),
  ])

  return Math.min(
    Math.max(
      project.github.lastCommitAt,
      latestPost?.createdAt ?? 0,
      latestRelease?.publishedAt ?? 0,
    ),
    Date.now(),
  )
}

type CityStatsDelta = {
  cityId: Id<'cities'>
  builders: number
  projects: number
  activityAt: number | null
}

/**
 * Per-city deltas collected during one mutation and applied once per city, so
 * a user with many projects costs one read and one write per affected city.
 */
export function createCityStatsChanges() {
  const deltas = new Map<string, CityStatsDelta>()

  function entry(cityId: Id<'cities'>) {
    const key = String(cityId)
    let delta = deltas.get(key)
    if (!delta) {
      delta = { cityId, builders: 0, projects: 0, activityAt: null }
      deltas.set(key, delta)
    }
    return delta
  }

  function recordActivity(cityId: Id<'cities'> | null, activityAt: number) {
    if (!cityId) {
      return
    }
    const delta = entry(cityId)
    delta.activityAt = Math.max(delta.activityAt ?? 0, activityAt)
  }

  return {
    /** Records a builder moving between counted cities (either may be null). */
    moveBuilder(from: Id<'cities'> | null, to: Id<'cities'> | null) {
      if (String(from) === String(to)) {
        return
      }
      if (from) entry(from).builders -= 1
      if (to) entry(to).builders += 1
    },

    /** Raises the city's `lastActivityAt` to at least `activityAt`. */
    recordActivity,

    /**
     * Records a project's transition from its stored row (null for a new
     * project) to its next `exploreOwner`. When it joins a city, its latest
     * activity is read (two bounded index reads) so `lastActivityAt` covers it.
     */
    async moveProject(
      db: Reader,
      project: Pick<Doc<'projects'>, '_id' | 'github'>,
      previous: ProjectCandidate | null,
      next: ProjectCandidate,
    ) {
      const from = previous ? getProjectCityId(previous) : null
      const to = getProjectCityId(next)
      if (String(from) === String(to)) {
        return
      }
      if (from) entry(from).projects -= 1
      if (to) {
        entry(to).projects += 1
        recordActivity(to, await getProjectActivityAt(db, project))
      }
    },

    async apply(db: DatabaseWriter) {
      for (const delta of deltas.values()) {
        await adjustCityStats(db, delta.cityId, delta)
      }
      deltas.clear()
    },
  }
}

export type CityStatsChanges = ReturnType<typeof createCityStatsChanges>

/** Smallest rise of `lastActivityAt` written for activity alone (1 hour). */
export const LAST_ACTIVITY_WRITE_STEP_MS = 60 * 60 * 1000

/**
 * `lastActivityAt` after a delta: null when no project counts; otherwise the
 * high-water mark, raised exactly when the counts change (the city is written
 * anyway) and, for activity alone, only when it moves by at least
 * `LAST_ACTIVITY_WRITE_STEP_MS` or was unset.
 */
function nextLastActivityAt(
  current: number | null,
  activityAt: number | null,
  {
    projectCount,
    countsChanged,
  }: { projectCount: number; countsChanged: boolean },
): number | null {
  if (projectCount === 0) {
    return null
  }
  if (activityAt === null || (current !== null && activityAt <= current)) {
    return current
  }
  if (
    countsChanged ||
    current === null ||
    activityAt - current >= LAST_ACTIVITY_WRITE_STEP_MS
  ) {
    return activityAt
  }
  return current
}

/**
 * Applies one delta to a city's stored counters. Counts never go below zero;
 * `lastActivityAt` only rises (see `nextLastActivityAt`), and is cleared when
 * no project counts. The city's `activityCell` follows the new counts.
 */
export async function adjustCityStats(
  db: DatabaseWriter,
  cityId: Id<'cities'>,
  delta: { builders?: number; projects?: number; activityAt?: number | null },
) {
  const builders = delta.builders ?? 0
  const projects = delta.projects ?? 0
  const activityAt = delta.activityAt ?? null
  if (builders === 0 && projects === 0 && activityAt === null) {
    return
  }

  const city = await db.get(cityId)
  if (!city) {
    return
  }

  const current = readCityStats(city)
  const builderCount = Math.max(0, current.builderCount + builders)
  const projectCount = Math.max(0, current.projectCount + projects)
  const next = {
    builderCount,
    projectCount,
    lastActivityAt: nextLastActivityAt(current.lastActivityAt, activityAt, {
      projectCount,
      countsChanged:
        builderCount !== current.builderCount ||
        projectCount !== current.projectCount,
    }),
  }

  const activityCell = getCityActivityCell(city, next)

  if (
    city.stats &&
    next.builderCount === current.builderCount &&
    next.projectCount === current.projectCount &&
    next.lastActivityAt === current.lastActivityAt &&
    city.activityCell === activityCell
  ) {
    return
  }

  // An undefined `activityCell` removes the field, taking the city out of
  // `by_activity_cell`.
  await db.patch(cityId, { stats: { ...city.stats, ...next }, activityCell })
}

/**
 * Raises the city's `lastActivityAt` for new activity on a project (a commit
 * seen by a metadata refresh, a post, a release) when the project counts for
 * a city. One read and at most one write, skipped while the rise is under
 * `LAST_ACTIVITY_WRITE_STEP_MS`.
 */
export async function recordProjectActivity(
  db: DatabaseWriter,
  project: ProjectCandidate,
  activityAt: number | null,
) {
  const cityId = getProjectCityId(project)
  if (!cityId || activityAt === null) {
    return
  }
  await adjustCityStats(db, cityId, { activityAt })
}

/**
 * Exact stats for one city from its own index ranges: the discoverable
 * members on `users.by_city_explore_rank` and the eligible projects on
 * `projects.by_explore_city_added`. Reads are bounded by the city's own
 * members and projects; used only by the recount migration.
 */
export async function computeCityStats(
  db: Reader,
  cityId: Id<'cities'>,
): Promise<CityStats> {
  const [candidates, projects] = await Promise.all([
    db
      .query('users')
      .withIndex('by_city_explore_rank', (query) =>
        query
          .eq('profile.cityId', cityId)
          .eq('appearInExplore', true)
          .eq('deletedAt', null)
          .eq('deactivatedAt', null),
      )
      .collect(),
    db
      .query('projects')
      .withIndex('by_explore_city_added', (query) =>
        query
          .eq('exploreOwner.cityId', cityId)
          .eq('exploreOwner.isEligible', true),
      )
      .collect(),
  ])

  const builderCount = candidates.filter(
    (user) => String(getBuilderCityId(user)) === String(cityId),
  ).length
  const activity = await Promise.all(
    projects.map((project) => getProjectActivityAt(db, project)),
  )

  return {
    builderCount,
    projectCount: projects.length,
    lastActivityAt: activity.length > 0 ? Math.max(...activity) : null,
  }
}

/** Stats for one city from a single document read; null for an unknown city. */
export async function getCityStats(
  db: Reader,
  cityId: Id<'cities'>,
): Promise<CityStats | null> {
  const city = await db.get(cityId)
  return city ? readCityStats(city) : null
}

/**
 * Sets a city's stats to the exact values from `computeCityStats`, stamping
 * `recountedAt` with the run's start time. Skips a city already recounted by
 * this run (later deltas keep it exact). Returns true when it recounted.
 */
export async function recountCityStats(
  db: DatabaseWriter,
  cityId: Id<'cities'>,
  runStartedAt: number,
): Promise<boolean> {
  const city = await db.get(cityId)
  if (!city || (city.stats?.recountedAt ?? -1) >= runStartedAt) {
    return false
  }

  const stats = await computeCityStats(db, cityId)
  await db.patch(cityId, {
    stats: { ...stats, recountedAt: runStartedAt },
    activityCell: getCityActivityCell(city, stats),
  })
  return true
}

/** Nearby cities a city page suggests and plots. */
const NEARBY_CITY_LIMIT = 5

/** Rows read per cell; nine cells bound one lookup to 9 x 20 city reads. */
export const NEARBY_CELL_READ_LIMIT = 20

export type NearbyActiveCity = {
  city: Doc<'cities'>
  stats: CityStats
  distanceKm: number
}

/**
 * The nearest active catalogue cities to `city`, closest first.
 * Reads only `by_activity_cell` for the city's cell and its eight
 * neighbours, one bounded `take` each; only cities with counted activity hold a
 * cell, so the read is bounded by active cities near the city, never by the
 * catalogue. Candidates are ranked by great-circle distance. A cell with more
 * than `NEARBY_CELL_READ_LIMIT` active cities contributes an arbitrary subset
 * of them.
 */
export async function readNearbyActiveCities(
  db: Reader,
  city: Pick<Doc<'cities'>, '_id' | 'location'>,
  limit: number = NEARBY_CITY_LIMIT,
): Promise<NearbyActiveCity[]> {
  const cells = await Promise.all(
    getNeighbouringCellKeys(city.location).map((cell) =>
      db
        .query('cities')
        .withIndex('by_activity_cell', (query) =>
          query.eq('activityCell', cell),
        )
        .take(NEARBY_CELL_READ_LIMIT),
    ),
  )

  return cells
    .flat()
    .filter(
      (candidate) =>
        String(candidate._id) !== String(city._id) &&
        candidate.isActive &&
        hasCityActivity(readCityStats(candidate)),
    )
    .map((candidate) => ({
      city: candidate,
      stats: readCityStats(candidate),
      distanceKm: getGreatCircleDistanceKm(city.location, candidate.location),
    }))
    .sort(
      (left, right) =>
        left.distanceKm - right.distanceKm ||
        left.city.name.localeCompare(right.city.name),
    )
    .slice(0, limit)
}
