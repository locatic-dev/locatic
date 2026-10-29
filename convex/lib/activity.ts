import type { Id } from '../_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import { getProjectActivityAt } from './cityStats'
import type { Doc } from './types'

/**
 * Builder activity signal. `users.stats.lastPublicActivityAt`
 * is the time of the builder's most recent publicly visible work:
 *
 *   max(latest published release, latest live post, latest commit)
 *
 * across the builder's visible projects (`locatic.isVisible`). Posts are
 * owner-only (`posts.create`), so a project's live posts are its owner's.
 * Likes, comments, follows and profile visits are not activity. Owner-level
 * discoverability (`appearInExplore`, city, deactivation) is not folded in:
 * the ranking indexes and the Explore page filter gate on it, so the signal
 * does not go stale when those settings change.
 *
 * Maintenance:
 * - Raised on write by the paths that create work: `posts.create`, release
 *   import (`github.patchProjectReleases`), metadata refresh
 *   (`github.patchProjectMetadata`, including the hourly
 *   `refreshActiveProjectMetadata`), repository import
 *   (`projects.upsertImportedRepositories`) and a project turning visible.
 * - Each project stores its own exact activity timestamp. The owner signal is
 *   then one indexed read across every visible project, regardless of count.
 * - Recomputed when work stops being public: a project turning hidden and a
 *   post or release being deleted, only when that work could have been latest.
 * - `internal.users.backfillLastPublicActivity` fills existing project rows
 *   before recomputing every user.
 *
 * A user with no visible work has no value (field unset), so the ranking
 * reads them after active builders.
 */

type Reader = DatabaseReader | DatabaseWriter

/**
 * Compatibility scan used only while existing project rows are waiting for
 * the one-off activity backfill. Once every project has its activity field,
 * normal recomputation uses `by_owner_visible_activity` below.
 */
// With project documents up to ~25 KB (README preview), one recompute reads at
// most ~1.25 MB and 101 index ranges.
export const ACTIVITY_PROJECT_SCAN_LIMIT = 50

/**
 * Exact signal for one user from their visible projects after the activity
 * backfill: the project activity index returns the maximum in one bounded
 * read. During the deployment backfill, owners with an unset project use the
 * previous bounded scan; exact ordering therefore requires that backfill to
 * finish before the frontend is deployed.
 */
export async function computeLastPublicActivityAt(
  db: Reader,
  userId: Id<'users'>,
  now: number = Date.now(),
): Promise<number | null> {
  const legacyProject = await db
    .query('projects')
    .withIndex('by_owner_visible_activity', (query) =>
      query
        .eq('ownerId', userId)
        .eq('locatic.isVisible', true)
        .eq('locatic.lastPublicActivityAt', undefined),
    )
    .first()

  if (!legacyProject) {
    const latestProject = await db
      .query('projects')
      .withIndex('by_owner_visible_activity', (query) =>
        query.eq('ownerId', userId).eq('locatic.isVisible', true),
      )
      .order('desc')
      .first()
    return latestProject?.locatic.lastPublicActivityAt === undefined
      ? null
      : Math.min(latestProject.locatic.lastPublicActivityAt, now)
  }

  const projects = await db
    .query('projects')
    .withIndex('by_owner_visible', (query) =>
      query.eq('ownerId', userId).eq('locatic.isVisible', true),
    )
    .order('desc')
    .take(ACTIVITY_PROJECT_SCAN_LIMIT)
  if (projects.length === 0) {
    return null
  }

  const activity = await Promise.all(
    projects.map((project) => getProjectActivityAt(db, project)),
  )
  return Math.min(Math.max(...activity), now)
}

/**
 * Recomputes and stores one project's exact activity from its commit, live
 * posts and published releases. Used when a source can be removed or lowered.
 */
export async function recomputeProjectPublicActivity(
  db: DatabaseWriter,
  projectId: Id<'projects'>,
): Promise<number | null> {
  const project = await db.get(projectId)
  if (!project) {
    return null
  }
  const activityAt = Math.min(
    await getProjectActivityAt(db, project),
    Date.now(),
  )
  if (project.locatic.lastPublicActivityAt !== activityAt) {
    await db.patch(project._id, {
      locatic: { ...project.locatic, lastPublicActivityAt: activityAt },
    })
  }
  return activityAt
}

/** Raises the stored project activity after a new public-work source. */
export async function raiseProjectPublicActivity(
  db: DatabaseWriter,
  projectId: Id<'projects'>,
  activityAt: number,
  now: number = Date.now(),
): Promise<number | null> {
  const project = await db.get(projectId)
  if (!project) {
    return null
  }
  const next = Math.min(activityAt, now)
  const stored = project.locatic.lastPublicActivityAt
  const current =
    stored ?? Math.min(await getProjectActivityAt(db, project), now)
  const result = Math.max(current, next)
  if (stored !== result) {
    await db.patch(project._id, {
      locatic: { ...project.locatic, lastPublicActivityAt: result },
    })
  }
  return result
}

/**
 * The next stats object after new activity at `activityAt`: the value only
 * rises, and a timestamp in the future is clamped to `now` so bad upstream
 * data cannot pin a builder to the top of the order. Returns `stats`
 * unchanged when nothing rises, so callers can fold it into a stats patch
 * they already make.
 */
export function raiseLastPublicActivity(
  stats: Doc<'users'>['stats'],
  activityAt: number | null,
  now: number = Date.now(),
): Doc<'users'>['stats'] {
  if (activityAt === null || !Number.isFinite(activityAt)) {
    return stats
  }
  const next = Math.min(activityAt, now)
  const current = stats.lastPublicActivityAt
  if (current !== undefined && next <= current) {
    return stats
  }
  return { ...stats, lastPublicActivityAt: next }
}

/** The stats object carrying an exact recomputed value (unset when null). */
export function withLastPublicActivity(
  stats: Doc<'users'>['stats'],
  activityAt: number | null,
): Doc<'users'>['stats'] {
  const next = { ...stats }
  delete next.lastPublicActivityAt
  return activityAt === null
    ? next
    : { ...next, lastPublicActivityAt: activityAt }
}

/**
 * Raises one user's signal to at least `activityAt`. Reads the user at call
 * time, so call it after any stats patch the same mutation makes from an
 * earlier read of the user (a later stats patch would overwrite it).
 */
export async function bumpLastPublicActivity(
  db: DatabaseWriter,
  userId: Id<'users'>,
  activityAt: number | null,
) {
  const user = await db.get(userId)
  if (!user) {
    return
  }
  const stats = raiseLastPublicActivity(user.stats, activityAt)
  if (stats !== user.stats) {
    await db.patch(userId, { stats })
  }
}

/**
 * The stats object with the signal recomputed, for work that stopped being
 * public at `removedActivityAt`. Recomputes only when that work could have
 * been the latest; otherwise the stored value still stands.
 */
export async function recomputeLastPublicActivityIfLatest(
  db: Reader,
  user: Pick<Doc<'users'>, '_id' | 'stats'>,
  removedActivityAt: number,
): Promise<Doc<'users'>['stats']> {
  const current = user.stats.lastPublicActivityAt
  if (current !== undefined && removedActivityAt < current) {
    return user.stats
  }
  return withLastPublicActivity(
    user.stats,
    await computeLastPublicActivityAt(db, user._id),
  )
}

// ---------------------------------------------------------------------------
// Hourly metadata refresh targets
// ---------------------------------------------------------------------------

/** Projects refreshed per hourly run when the caller gives no limit. */
export const DEFAULT_METADATA_REFRESH_LIMIT = 25
export const MAX_METADATA_REFRESH_LIMIT = 100
/** Candidate rows read per target slot (the read stays bounded at 4x limit). */
export const METADATA_REFRESH_SCAN_FACTOR = 4

export function clampMetadataRefreshLimit(limit: number | undefined) {
  return Math.min(
    Math.max(Math.floor(limit ?? DEFAULT_METADATA_REFRESH_LIMIT), 1),
    MAX_METADATA_REFRESH_LIMIT,
  )
}

/**
 * Chooses the projects to refresh from candidates ordered stalest first.
 * Projects visible in discovery (`exploreOwner.isEligible`) come first, since
 * their commit times feed Explore and the activity signal. A fifth of the
 * slots (at least one) always goes to the stalest candidates regardless of
 * eligibility, so profile-only projects are never starved. Keeps the
 * stalest-first order.
 */
export function selectMetadataRefreshTargets<
  T extends { exploreOwner: { isEligible: boolean } },
>(candidates: readonly T[], limit: number): T[] {
  const selected = new Set<T>(candidates.slice(0, Math.ceil(limit / 5)))
  for (const candidate of candidates) {
    if (selected.size >= limit) break
    if (candidate.exploreOwner.isEligible) selected.add(candidate)
  }
  for (const candidate of candidates) {
    if (selected.size >= limit) break
    selected.add(candidate)
  }
  return candidates.filter((candidate) => selected.has(candidate))
}
