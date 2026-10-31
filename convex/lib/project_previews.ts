import { v, type Infer } from 'convex/values'

import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import type { Doc } from './types'
import { resolveProjectOwnerLogin } from './project_route'
import { getProjectReactionCounts } from './reactions'
import { getProjectTopics } from './topics'
import {
  buildStatusValidator,
  locationDisclosureValidator,
  optionalStringValidator,
} from './validators'
import {
  resolveLocationDisclosure,
  toSnapshotLocation,
  type DisclosureCity,
  type LocationDisclosure,
  type LocationPolicyUser,
} from './visibility'

type Reader = DatabaseReader | DatabaseWriter

export type ProjectCardPreviewAudience = 'private' | 'public'

/**
 * How long a successful metadata sync counts as fresh. The hourly refresh
 * walks visible projects oldest-attempt first, so a project that has not
 * synced for a week is behind its repository.
 */
export const PROJECT_SYNC_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A successful refresh stamps `lastMetadataSyncedAt` in the action and
 * `lastMetadataSyncAttemptedAt` in the later patch mutation, so the attempt is
 * always a little newer. Only an attempt this much newer than the last success
 * is a failure; an action cannot run longer than ten minutes.
 */
export const PROJECT_SYNC_FAILURE_GRACE_MS = 10 * 60 * 1000

const MAX_SYNC_ERROR_LENGTH = 200

const projectLatestUpdateKindValidator = v.union(
  v.literal('release'),
  v.literal('post'),
  v.literal('repo'),
)

/** Most recent public activity: a release, a post, or a repository push. */
export const projectLatestUpdateValidator = v.union(
  v.object({
    kind: projectLatestUpdateKindValidator,
    at: v.number(),
    label: v.optional(v.string()),
  }),
  v.null(),
)

/**
 * Metadata sync state, separate from activity. `at` is the last successful
 * sync (null when there has been none). `failed` and `error` are owner-only:
 * other viewers see the freshness of the last successful sync instead.
 */
export const projectSyncStatusValidator = v.object({
  kind: v.union(
    v.literal('fresh'),
    v.literal('stale'),
    v.literal('failed'),
    v.literal('never'),
  ),
  at: v.union(v.number(), v.null()),
  hasReadme: v.boolean(),
  error: v.optional(v.string()),
})

export type ProjectLatestUpdate = Infer<typeof projectLatestUpdateValidator>
export type ProjectSyncStatus = Infer<typeof projectSyncStatusValidator>

/** Card signals: who and where the builder is, what happened last, sync state. */
export const projectCardSignalsFields = {
  ownerLocation: locationDisclosureValidator,
  ownerBuildStatus: buildStatusValidator,
  latestUpdate: projectLatestUpdateValidator,
  syncStatus: projectSyncStatusValidator,
}

export type ProjectCardSignals = {
  ownerLocation: LocationDisclosure
  ownerBuildStatus: Doc<'users'>['profile']['buildStatus']
  latestUpdate: ProjectLatestUpdate
  syncStatus: ProjectSyncStatus
}

/**
 * The one return validator for `buildProjectCardPreview`. Signals are optional
 * while callers migrate: a caller that passes `signals` must return them.
 */
export const projectCardPreviewFields = {
  projectId: v.id('projects'),
  ownerUserId: v.id('users'),
  fullName: v.string(),
  owner: v.string(),
  repo: v.string(),
  description: optionalStringValidator,
  primaryLanguage: optionalStringValidator,
  languages: v.array(v.object({ name: v.string(), bytes: v.number() })),
  githubStars: v.number(),
  locaticLikes: v.number(),
  reactionCounts: v.record(v.string(), v.number()),
  commentsCount: v.number(),
  postsCount: v.number(),
  topics: v.array(v.string()),
  lastCommitAt: v.number(),
  updatedAt: v.number(),
  authorName: v.string(),
  authorHandle: v.string(),
  authorAvatarUrl: optionalStringValidator,
  cityLabel: optionalStringValidator,
  cityVisibilityState: v.union(
    v.literal('exact_city'),
    v.literal('region_only'),
    v.literal('hidden'),
    v.literal('unset'),
  ),
  ownerLocation: v.optional(projectCardSignalsFields.ownerLocation),
  ownerBuildStatus: v.optional(projectCardSignalsFields.ownerBuildStatus),
  latestUpdate: v.optional(projectCardSignalsFields.latestUpdate),
  syncStatus: v.optional(projectCardSignalsFields.syncStatus),
}

export const projectCardPreviewValidator = v.object(projectCardPreviewFields)

export type ProjectCardPreviewRecord = {
  projectId: Doc<'projects'>['_id']
  ownerUserId: Doc<'users'>['_id']
  fullName: string
  owner: string
  repo: string
  description: string | null
  primaryLanguage: string | null
  languages: Doc<'projects'>['github']['languages']
  githubStars: number
  locaticLikes: number
  reactionCounts: Record<string, number>
  commentsCount: number
  postsCount: number
  topics: string[]
  lastCommitAt: number
  updatedAt: number
  authorName: string
  authorHandle: string
  authorAvatarUrl: string | null
  cityLabel: string | null
  cityVisibilityState: 'exact_city' | 'region_only' | 'hidden' | 'unset'
} & Partial<ProjectCardSignals>

async function getOwnerCity(
  db: Reader,
  owner: Doc<'users'>,
): Promise<Doc<'cities'> | null> {
  return owner.profile.cityId ? await db.get(owner.profile.cityId) : null
}

/**
 * Public city label for a user under the visibility policy
 * (`convex/lib/visibility.ts`): the exact city display name for `exact_city`, the region/country label
 * from the city record for `region_only` (country only for city-states such
 * as Berlin), and null for `hidden` or when no city is set. `city` must be
 * the user's profile city record.
 */
export function resolvePublicCityLabel(
  user: LocationPolicyUser,
  city: DisclosureCity | null | undefined,
): string | null {
  return toSnapshotLocation(resolveLocationDisclosure(user, city)).cityName
}

/**
 * Public preview location fields:
 * - exact city: `{ cityLabel: city display name, cityVisibilityState: 'exact_city' }`
 * - region only: `{ cityLabel: region label, cityVisibilityState: 'region_only' }`
 * - hidden, with a city set: `{ cityLabel: null, cityVisibilityState: 'hidden' }`
 * - no city, or nothing disclosable: `{ cityLabel: null, cityVisibilityState: 'unset' }`
 */
function resolvePublicPreviewLocation(
  owner: Doc<'users'>,
  city: Doc<'cities'> | null,
): Pick<ProjectCardPreviewRecord, 'cityLabel' | 'cityVisibilityState'> {
  const disclosure = resolveLocationDisclosure(owner, city)
  switch (disclosure.kind) {
    case 'city':
      return {
        cityLabel: disclosure.cityName,
        cityVisibilityState: 'exact_city',
      }
    case 'region':
      return {
        cityLabel: disclosure.regionLabel,
        cityVisibilityState: 'region_only',
      }
    case 'none':
    default:
      return {
        cityLabel: null,
        cityVisibilityState:
          city && owner.privacy.cityVisibility === 'hidden'
            ? 'hidden'
            : 'unset',
      }
  }
}

/**
 * The most recent of the latest published release, the latest live post and
 * the last repository push. Two indexed single-row reads.
 */
export async function getProjectLatestUpdate(
  db: Reader,
  project: Doc<'projects'>,
): Promise<ProjectLatestUpdate> {
  const [release, post] = await Promise.all([
    db
      .query('project_releases')
      .withIndex('by_project_published', (query) =>
        query.eq('projectId', project._id),
      )
      .order('desc')
      .first(),
    db
      .query('posts')
      .withIndex('by_project_deleted_created', (query) =>
        query.eq('projectId', project._id).eq('deletedAt', null),
      )
      .order('desc')
      .first(),
  ])

  // Ordered by preference when two updates share a timestamp.
  const candidates: Array<NonNullable<ProjectLatestUpdate>> = []
  if (release && !release.isDraft && release.publishedAt !== null) {
    candidates.push({
      kind: 'release',
      at: release.publishedAt,
      label: release.tagName,
    })
  }
  if (post) {
    candidates.push({ kind: 'post', at: post.createdAt })
  }
  if (project.github.lastCommitAt > 0) {
    candidates.push({ kind: 'repo', at: project.github.lastCommitAt })
  }

  return candidates.reduce<ProjectLatestUpdate>(
    (latest, candidate) =>
      latest === null || candidate.at > latest.at ? candidate : latest,
    null,
  )
}

/**
 * Metadata sync state for a viewer. Only the owner learns that the last
 * refresh failed (and why); everyone else sees how fresh the last successful
 * sync is.
 */
export async function getProjectSyncStatus(
  db: Reader,
  project: Doc<'projects'>,
  args: { viewerId: Id<'users'> | null; now: number },
): Promise<ProjectSyncStatus> {
  const syncedAt = project.github.lastMetadataSyncedAt ?? null
  const attemptedAt = project.github.lastMetadataSyncAttemptedAt ?? null
  const hasReadme = Boolean(project.github.readmePreview?.trim())
  const lastAttemptFailed =
    attemptedAt !== null &&
    (syncedAt === null ||
      attemptedAt - syncedAt > PROJECT_SYNC_FAILURE_GRACE_MS)
  const viewerIsOwner =
    args.viewerId !== null && String(args.viewerId) === String(project.ownerId)

  if (lastAttemptFailed && viewerIsOwner) {
    // `recordProjectMetadataSyncFailure` stamps the project attempt and the
    // log row with the same time, so the failure is one exact index read.
    const failure = await db
      .query('github_sync_log')
      .withIndex('by_user_synced_at', (query) =>
        query.eq('userId', project.ownerId).eq('syncedAt', attemptedAt),
      )
      .first()
    const error =
      failure?.status === 'failed' && failure.syncType === 'metadata'
        ? failure.error?.trim().slice(0, MAX_SYNC_ERROR_LENGTH)
        : undefined

    return {
      kind: 'failed',
      at: syncedAt,
      hasReadme,
      ...(error ? { error } : {}),
    }
  }

  if (syncedAt === null) {
    return { kind: 'never', at: null, hasReadme }
  }

  return {
    kind: args.now - syncedAt > PROJECT_SYNC_STALE_AFTER_MS ? 'stale' : 'fresh',
    at: syncedAt,
    hasReadme,
  }
}

/**
 * Card signals for one project. `ownerCity` must be the owner's profile city.
 * The private audience is the owner looking at their own work, so their city
 * is always disclosed to them.
 */
export async function buildProjectCardSignals(
  db: Reader,
  project: Doc<'projects'>,
  args: {
    audience: ProjectCardPreviewAudience
    owner: Doc<'users'>
    ownerCity: Doc<'cities'> | null
    viewerId: Id<'users'> | null
    now?: number
  },
): Promise<ProjectCardSignals> {
  const ownerLocation: LocationDisclosure =
    args.audience === 'private'
      ? resolveLocationDisclosure(
          {
            profile: args.owner.profile,
            privacy: { cityVisibility: 'exact_city' },
          },
          args.ownerCity,
        )
      : resolveLocationDisclosure(args.owner, args.ownerCity)
  const [latestUpdate, syncStatus] = await Promise.all([
    getProjectLatestUpdate(db, project),
    getProjectSyncStatus(db, project, {
      viewerId: args.viewerId,
      now: args.now ?? Date.now(),
    }),
  ])

  return {
    ownerLocation,
    ownerBuildStatus: args.owner.profile.buildStatus,
    latestUpdate,
    syncStatus,
  }
}

export async function buildProjectCardPreview(
  db: Reader,
  project: Doc<'projects'>,
  args: {
    audience: ProjectCardPreviewAudience
    owner?: Doc<'users'>
    /**
     * Adds `ownerLocation`, `ownerBuildStatus`, `latestUpdate` and
     * `syncStatus` (two or three extra indexed reads). The caller's return
     * validator must be `projectCardPreviewValidator`.
     */
    signals?: { viewerId: Id<'users'> | null; now?: number }
  },
): Promise<ProjectCardPreviewRecord> {
  const owner = args.owner ?? (await db.get(project.ownerId))
  if (!owner) {
    throw new Error(`Owner not found for project ${project.github.fullName}`)
  }

  const ownerHandle = owner.github.username
  const routeOwner = resolveProjectOwnerLogin(project)
  const ownerDisplayName = owner.profile.displayName
  const ownerCity = await getOwnerCity(db, owner)
  const { cityLabel, cityVisibilityState } =
    args.audience === 'private'
      ? {
          cityLabel: ownerCity?.displayName ?? null,
          cityVisibilityState: ownerCity
            ? ('exact_city' as const)
            : ('unset' as const),
        }
      : resolvePublicPreviewLocation(owner, ownerCity)
  const signals = args.signals
    ? await buildProjectCardSignals(db, project, {
        audience: args.audience,
        owner,
        ownerCity,
        viewerId: args.signals.viewerId,
        now: args.signals.now,
      })
    : null

  return {
    projectId: project._id,
    ownerUserId: project.ownerId,
    fullName: project.github.fullName,
    owner: routeOwner,
    repo: project.github.name,
    description: project.github.description,
    primaryLanguage: project.github.primaryLanguage,
    languages: project.github.languages,
    githubStars: project.github.stargazersCount,
    locaticLikes: project.locatic.likesCount,
    reactionCounts: getProjectReactionCounts(project),
    commentsCount: project.locatic.commentsCount,
    postsCount: project.locatic.postsCount ?? 0,
    // The card shows exactly the topics the Explore filter tests.
    topics: getProjectTopics(project),
    lastCommitAt: project.github.lastCommitAt,
    updatedAt: project.updatedAt,
    authorName: ownerDisplayName,
    authorHandle: ownerHandle,
    authorAvatarUrl: owner.profile.avatarUrl,
    cityLabel,
    cityVisibilityState,
    ...signals,
  }
}
